import { readFile, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { diff as jestDiff } from 'jest-diff';

import type { FilterSchemasAndGroups } from '../../src/framework/filters';
import { requestGeminiGenerateContent } from '../../src/components/aiAssistant';

type PromptRunResult = {
    userPrompt: string;
    durationMs: number;
    ok: boolean;
    responseJson?: unknown;
    aiText?: string;
    parsedFilterFormStateById?: unknown;
    parsedFilterFormStateJsonText?: string;
    parseError?: string;
    error?: string;
};

type RegressionRun = {
    timestamp: string;
    dtvVersion: string;
    modelId: string;
    averageResponseTimeMs: number | null;
    results: PromptRunResult[];
};

type RunDiff = {
    previousRunPath: string;
    currentRunPath: string;
    markdownPath: string;
    prettyMarkdownPath?: string;
    text: string;
    prettyText?: string;
};

const DEFAULT_PROMPTS: string[] = [
    'authorized payments in euro or danish krona this week',
    'failed payments from yesterday',
    'credit card payments above 1000 DKK in the last 30 days',
    'mobilepay payments from the last 7 days',
    'requests initiated by customer email containing "@boozt.com"',
    'payment requests for merchant Boozt Dev',
    'pending payments placed today',
    'paypal payments in EUR during January 2026'
];

function parseDotEnvFile(contents: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        // Strip surrounding quotes if present
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        env[key] = value;
    }
    return env;
}

async function loadEnvDevelopment(repoRoot: string): Promise<Record<string, string>> {
    try {
        const dotenvPath = path.join(repoRoot, '.env.development');
        const raw = await readFile(dotenvPath, 'utf-8');
        return parseDotEnvFile(raw);
    } catch {
        return {};
    }
}

async function readJsonFile<T>(absolutePath: string): Promise<T> {
    const raw = await readFile(absolutePath, 'utf-8');
    return JSON.parse(raw) as T;
}

async function getDtvVersion(repoRoot: string): Promise<string> {
    const pkg = await readJsonFile<{ version?: string }>(path.join(repoRoot, 'package.json'));
    return pkg.version ?? 'unknown';
}

async function getPaymentRequestsFilterSchema(repoRoot: string): Promise<FilterSchemasAndGroups> {
    const viewJson = await readJsonFile<{ filterSchema: FilterSchemasAndGroups }>(
        path.join(repoRoot, 'src/views/payment-requests/view.json')
    );
    return viewJson.filterSchema;
}

function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function parseFilterFormStateFromAiText(aiText: string): {
    parsed?: unknown;
    jsonText?: string;
    error?: string;
} {
    const match = aiText.match(/\{[\s\S]*\}/);
    if (!match) {
        return { error: 'Could not find JSON object in aiText' };
    }

    const jsonText = match[0];
    try {
        const parsed = JSON.parse(jsonText);
        return { parsed, jsonText };
    } catch (error: any) {
        return {
            jsonText,
            error: error?.message ? String(error.message) : String(error)
        };
    }
}

async function findMostRecentPreviousRunFile(args: {
    runsDir: string;
    excludePath: string;
}): Promise<string | null> {
    const excludeBase = path.basename(args.excludePath);
    const entries = await readdir(args.runsDir, { withFileTypes: true });

    const candidates: { filePath: string; mtimeMs: number }[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.startsWith('gemini-regression-') || !entry.name.endsWith('.json')) continue;
        if (entry.name === excludeBase) continue;

        const filePath = path.join(args.runsDir, entry.name);
        const s = await stat(filePath);
        candidates.push({ filePath, mtimeMs: s.mtimeMs });
    }

    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0]?.filePath ?? null;
}

function indexResultsByPrompt(results: PromptRunResult[]): Map<string, PromptRunResult> {
    const map = new Map<string, PromptRunResult>();
    for (const result of results) {
        map.set(result.userPrompt, result);
    }
    return map;
}

function stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const stringify = (v: any): any => {
        if (v === null || v === undefined) return v;
        if (typeof v !== 'object') return v;
        if (v instanceof Date) return v.toISOString();
        if (Array.isArray(v)) return v.map(stringify);
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
        const out: Record<string, any> = {};
        for (const key of Object.keys(v).sort()) {
            out[key] = stringify(v[key]);
        }
        return out;
    };
    return JSON.stringify(stringify(value), null, 4);
}

function valuesDeepEqual(a: unknown, b: unknown): boolean {
    return stableStringify(a) === stableStringify(b);
}

function valueToInlineString(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
        const truncated = value.length > 160 ? `${value.slice(0, 160)}…` : value;
        return JSON.stringify(truncated);
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    const text = JSON.stringify(value);
    if (typeof text === 'string' && text.length <= 200) return text;
    const expanded = stableStringify(value);
    return expanded.length <= 200 ? expanded : `${expanded.slice(0, 200)}…`;
}

type DeepChange = {
    path: string;
    kind: 'added' | 'removed' | 'changed';
    before?: unknown;
    after?: unknown;
};

function shallowKeySummary(before: unknown, after: unknown): {
    unchanged: string[];
    added: string[];
    removed: string[];
    changed: string[];
} {
    const unchanged: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    const beforeIsObject = typeof before === 'object' && before !== null && !Array.isArray(before);
    const afterIsObject = typeof after === 'object' && after !== null && !Array.isArray(after);
    if (!beforeIsObject || !afterIsObject) {
        return { unchanged, added, removed, changed };
    }

    const aObj = before as Record<string, unknown>;
    const bObj = after as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(aObj), ...Object.keys(bObj)])).sort();

    for (const key of keys) {
        const inA = key in aObj;
        const inB = key in bObj;
        if (!inA && inB) {
            added.push(key);
            continue;
        }
        if (inA && !inB) {
            removed.push(key);
            continue;
        }
        if (valuesDeepEqual(aObj[key], bObj[key])) {
            unchanged.push(key);
        } else {
            changed.push(key);
        }
    }

    return { unchanged, added, removed, changed };
}

function collectDeepChanges(args: {
    before: unknown;
    after: unknown;
    path: string;
    out: DeepChange[];
}): void {
    const { before, after, path, out } = args;

    if (valuesDeepEqual(before, after)) return;

    const beforeIsArray = Array.isArray(before);
    const afterIsArray = Array.isArray(after);

    const beforeIsObject = typeof before === 'object' && before !== null;
    const afterIsObject = typeof after === 'object' && after !== null;

    // Different shapes/types -> treat as a single changed node
    if (beforeIsArray !== afterIsArray) {
        out.push({ path, kind: 'changed', before, after });
        return;
    }
    if (!beforeIsObject || !afterIsObject) {
        out.push({ path, kind: 'changed', before, after });
        return;
    }

    if (beforeIsArray && afterIsArray) {
        const a = before as unknown[];
        const b = after as unknown[];
        const maxLen = Math.max(a.length, b.length);
        for (let i = 0; i < maxLen; i++) {
            const nextPath = `${path}[${i}]`;
            if (i >= a.length) {
                out.push({ path: nextPath, kind: 'added', after: b[i] });
                continue;
            }
            if (i >= b.length) {
                out.push({ path: nextPath, kind: 'removed', before: a[i] });
                continue;
            }
            collectDeepChanges({ before: a[i], after: b[i], path: nextPath, out });
        }
        return;
    }

    const aObj = before as Record<string, unknown>;
    const bObj = after as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(aObj), ...Object.keys(bObj)])).sort();

    for (const key of keys) {
        const nextPath = path ? `${path}.${key}` : key;
        if (!(key in aObj)) {
            out.push({ path: nextPath, kind: 'added', after: bObj[key] });
            continue;
        }
        if (!(key in bObj)) {
            out.push({ path: nextPath, kind: 'removed', before: aObj[key] });
            continue;
        }

        collectDeepChanges({ before: aObj[key], after: bObj[key], path: nextPath, out });
    }
}

function buildRunDiffMarkdown(args: {
    previousRunPath: string;
    currentRunPath: string;
    previousRun: RegressionRun;
    currentRun: RegressionRun;
}): string {
    const prevByPrompt = indexResultsByPrompt(args.previousRun.results);
    const currByPrompt = indexResultsByPrompt(args.currentRun.results);
    const allPrompts = Array.from(new Set([...prevByPrompt.keys(), ...currByPrompt.keys()])).sort();

    const lines: string[] = [];
    lines.push(`# Gemini regression diff`);
    lines.push('');
    lines.push(`- Previous: ${args.previousRunPath}`);
    lines.push(`- Current: ${args.currentRunPath}`);
    lines.push('');

    for (const prompt of allPrompts) {
        const prev = prevByPrompt.get(prompt);
        const curr = currByPrompt.get(prompt);

        lines.push(`## Prompt`);
        lines.push('');
        lines.push('```');
        lines.push(prompt);
        lines.push('```');
        lines.push('');

        if (!prev) {
            lines.push(`- Status: added in current run`);
            lines.push('');
        } else if (!curr) {
            lines.push(`- Status: removed in current run`);
            lines.push('');
        }

        if (prev?.ok === false || curr?.ok === false) {
            lines.push(`- Previous ok: ${prev ? String(prev.ok) : 'n/a'}`);
            if (prev?.error) lines.push(`- Previous error: ${prev.error}`);
            lines.push(`- Current ok: ${curr ? String(curr.ok) : 'n/a'}`);
            if (curr?.error) lines.push(`- Current error: ${curr.error}`);
            lines.push('');
            continue;
        }

        const prevState = (prev?.parsedFilterFormStateById ?? {}) as Record<string, unknown>;
        const currState = (curr?.parsedFilterFormStateById ?? {}) as Record<string, unknown>;

        const allFilterIds = Array.from(new Set([...Object.keys(prevState), ...Object.keys(currState)])).sort();

        const unchanged: string[] = [];
        const added: string[] = [];
        const removed: string[] = [];
        const changed: string[] = [];

        for (const filterId of allFilterIds) {
            const inPrev = filterId in prevState;
            const inCurr = filterId in currState;
            if (!inPrev && inCurr) {
                added.push(filterId);
                continue;
            }
            if (inPrev && !inCurr) {
                removed.push(filterId);
                continue;
            }

            if (valuesDeepEqual(prevState[filterId], currState[filterId])) {
                unchanged.push(filterId);
            } else {
                changed.push(filterId);
            }
        }

        lines.push(`- Unchanged filter IDs: ${unchanged.length ? unchanged.join(', ') : '(none)'}`);
        lines.push(`- Added filter IDs: ${added.length ? added.join(', ') : '(none)'}`);
        lines.push(`- Removed filter IDs: ${removed.length ? removed.join(', ') : '(none)'}`);
        lines.push(`- Changed filter IDs: ${changed.length ? changed.join(', ') : '(none)'}`);
        lines.push('');

        for (const filterId of changed) {
            const before = prevState[filterId];
            const after = currState[filterId];
            const out: DeepChange[] = [];
            collectDeepChanges({ before, after, path: filterId, out });

            const shallow = shallowKeySummary(before, after);

            lines.push(`### ${filterId}`);
            lines.push('');

            if (shallow.unchanged.length || shallow.added.length || shallow.removed.length || shallow.changed.length) {
                lines.push(`- Top-level unchanged: ${shallow.unchanged.length ? shallow.unchanged.join(', ') : '(none)'}`);
                lines.push(`- Top-level added: ${shallow.added.length ? shallow.added.join(', ') : '(none)'}`);
                lines.push(`- Top-level removed: ${shallow.removed.length ? shallow.removed.join(', ') : '(none)'}`);
                lines.push(`- Top-level changed: ${shallow.changed.length ? shallow.changed.join(', ') : '(none)'}`);
                lines.push('');
            }

            for (const change of out) {
                if (change.kind === 'added') {
                    lines.push('- \\+ `' + change.path + '`: ' + valueToInlineString(change.after));
                } else if (change.kind === 'removed') {
                    lines.push('- \\- `' + change.path + '`: ' + valueToInlineString(change.before));
                } else {
                    lines.push(
                        '- \\~ `' + change.path + '`: ' +
                        valueToInlineString(change.before) + ' → ' +
                        valueToInlineString(change.after)
                    );
                }
            }
            lines.push('');
        }
    }

    return lines.join('\n') + '\n';
}

function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function buildDiffMarkdown(args: {
    previousRunPath: string;
    currentRunPath: string;
    previousRun: RegressionRun;
    currentRun: RegressionRun;
}): string {
    const prevByPrompt = indexResultsByPrompt(args.previousRun.results);
    const currByPrompt = indexResultsByPrompt(args.currentRun.results);
    const allPrompts = Array.from(new Set([...prevByPrompt.keys(), ...currByPrompt.keys()])).sort();

    const lines: string[] = [];
    lines.push(`# Gemini regression diff`);
    lines.push('');
    lines.push(`- Previous: ${args.previousRunPath}`);
    lines.push(`- Current: ${args.currentRunPath}`);
    lines.push('');

    for (const prompt of allPrompts) {
        const prev = prevByPrompt.get(prompt);
        const curr = currByPrompt.get(prompt);

        if (!prev && !curr) continue;
        if (prev?.ok === false || curr?.ok === false) continue;

        const prevState = (prev?.parsedFilterFormStateById ?? {}) as Record<string, unknown>;
        const currState = (curr?.parsedFilterFormStateById ?? {}) as Record<string, unknown>;

        const allFilterIds = Array.from(new Set([...Object.keys(prevState), ...Object.keys(currState)])).sort();
        const changedFilterIds = allFilterIds.filter((filterId) => {
            const inPrev = filterId in prevState;
            const inCurr = filterId in currState;
            if (!inPrev || !inCurr) return true;
            return !valuesDeepEqual(prevState[filterId], currState[filterId]);
        });
        if (changedFilterIds.length === 0) continue;

        lines.push('---');
        lines.push('');
        lines.push(`## Prompt`);
        lines.push('');
        lines.push('```');
        lines.push(prompt);
        lines.push('```');
        lines.push('');
        lines.push(`Unchanged: ${allFilterIds.length - changedFilterIds.length}, Changed: ${changedFilterIds.length}`);
        lines.push('');

        for (const filterId of changedFilterIds) {
            const diffText = jestDiff(prevState[filterId] ?? null, currState[filterId] ?? null, {
                aAnnotation: `${filterId} (previous)`,
                bAnnotation: `${filterId} (current)`,
                expand: false,
            });
            if (!diffText) continue;

            lines.push('```diff');
            lines.push(stripAnsi(diffText));
            lines.push('```');
            lines.push('');
        }
    }

    return lines.join('\n') + '\n';
}

async function buildAndWriteRunDiff(args: {
    runsDir: string;
    previousRunPath: string;
    currentRunPath: string;
    previousRun: RegressionRun;
    currentRun: RegressionRun;
}): Promise<RunDiff> {
    const timestamp = args.currentRun.timestamp;
    const fileSafeTimestamp = timestamp.replace(/[:.]/g, '-');
    const markdownPath = path.join(args.runsDir, `gemini-regression-diff-${fileSafeTimestamp}.md`);
    const markdown = buildRunDiffMarkdown({
        previousRunPath: args.previousRunPath,
        currentRunPath: args.currentRunPath,
        previousRun: args.previousRun,
        currentRun: args.currentRun,
    });
    await writeFile(markdownPath, markdown, 'utf-8');

    const prettyMarkdownPath = path.join(args.runsDir, `gemini-regression-diff-pretty-${fileSafeTimestamp}.md`);
    const prettyMarkdown = buildDiffMarkdown({
        previousRunPath: args.previousRunPath,
        currentRunPath: args.currentRunPath,
        previousRun: args.previousRun,
        currentRun: args.currentRun,
    });
    await writeFile(prettyMarkdownPath, prettyMarkdown, 'utf-8');

    return {
        previousRunPath: args.previousRunPath,
        currentRunPath: args.currentRunPath,
        markdownPath,
        prettyMarkdownPath,
        text: markdown,
        prettyText: prettyMarkdown,
    };
}

async function main(): Promise<void> {
    const repoRoot = process.cwd();

    const envDevelopment = await loadEnvDevelopment(repoRoot);
    const geminiApiKey =
        process.env.GEMINI_API_KEY ||
        process.env.VITE_GEMINI_API_KEY ||
        envDevelopment.VITE_GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('Missing Gemini API key. Set GEMINI_API_KEY or VITE_GEMINI_API_KEY (or provide VITE_GEMINI_API_KEY in .env.development).');
    }

    const modelIdOverride = process.env.GEMINI_MODEL_ID || undefined;
    const httpReferer =
        process.env.GEMINI_HTTP_REFERER ||
        process.env.VITE_AI_TEST_GEMINI_HTTP_REFERER ||
        envDevelopment.VITE_AI_TEST_GEMINI_HTTP_REFERER;
    const origin = httpReferer ? new URL(httpReferer).origin : undefined;
    const prompts = DEFAULT_PROMPTS;

    const dtvVersion = await getDtvVersion(repoRoot);
    const filterSchema = await getPaymentRequestsFilterSchema(repoRoot);

    const results: PromptRunResult[] = [];
    let resolvedModelId: string | null = null;

    for (const userPrompt of prompts) {
        const started = performance.now();
        try {
            const { responseJson, aiText, modelId } = await requestGeminiGenerateContent({
                filterSchema,
                userPrompt,
                geminiApiKey,
                modelId: modelIdOverride,
                httpReferer,
                origin,
            });
            const durationMs = performance.now() - started;

            const parsed = parseFilterFormStateFromAiText(aiText);
            results.push({
                userPrompt,
                durationMs,
                ok: true,
                responseJson,
                aiText,
                parsedFilterFormStateById: parsed.parsed,
                parsedFilterFormStateJsonText: parsed.jsonText,
                parseError: parsed.error,
            });

            resolvedModelId ??= modelId;
        } catch (error: any) {
            const durationMs = performance.now() - started;
            results.push({
                userPrompt,
                durationMs,
                ok: false,
                error: error?.message ? String(error.message) : String(error),
            });
        }
    }

    const okDurations = results.filter(r => r.ok).map(r => r.durationMs);
    const averageResponseTimeMs = mean(okDurations);

    const timestamp = new Date().toISOString();
    const finalModelId = resolvedModelId ?? modelIdOverride ?? 'unknown';

    const run: RegressionRun = {
        timestamp,
        dtvVersion,
        modelId: finalModelId,
        averageResponseTimeMs,
        results,
    };

    const runsDir = path.join(repoRoot, 'scripts/ai-regression/runs');
    await mkdir(runsDir, { recursive: true });

    const fileSafeTimestamp = timestamp.replace(/[:.]/g, '-');
    const outPath = path.join(runsDir, `gemini-regression-${fileSafeTimestamp}.json`);
    await writeFile(outPath, JSON.stringify(run, null, 4) + '\n', 'utf-8');

    console.log(`Wrote: ${outPath}`);
    console.log(`Average response time (ms): ${averageResponseTimeMs ?? 'n/a'}`);

    const previousRunPath = await findMostRecentPreviousRunFile({ runsDir, excludePath: outPath });
    if (!previousRunPath) {
        console.log('No previous run found to diff against.');
        return;
    }

    const previousRun = await readJsonFile<RegressionRun>(previousRunPath);
    const diffReport = await buildAndWriteRunDiff({
        runsDir,
        previousRunPath,
        currentRunPath: outPath,
        previousRun,
        currentRun: run,
    });

    console.log(`Diff against: ${previousRunPath}`);
    console.log(`Diff report: ${diffReport.markdownPath}`);
    console.log(`Diff report (pretty): ${diffReport.prettyMarkdownPath}`);

    // Also print a highlighted diff to the terminal (best-effort).
    const prevByPrompt = indexResultsByPrompt(previousRun.results);
    const currByPrompt = indexResultsByPrompt(run.results);
    const allPrompts = Array.from(new Set([...prevByPrompt.keys(), ...currByPrompt.keys()])).sort();

    for (const prompt of allPrompts) {
        const prev = prevByPrompt.get(prompt);
        const curr = currByPrompt.get(prompt);

        // Skip if both are missing
        if (!prev && !curr) continue;

        // Skip if either request failed; markdown report already contains errors.
        if (prev?.ok === false || curr?.ok === false) continue;

        const prevState = (prev?.parsedFilterFormStateById ?? {}) as Record<string, unknown>;
        const currState = (curr?.parsedFilterFormStateById ?? {}) as Record<string, unknown>;

        const allFilterIds = Array.from(new Set([...Object.keys(prevState), ...Object.keys(currState)])).sort();
        const changedFilterIds = allFilterIds.filter((filterId) => {
            const inPrev = filterId in prevState;
            const inCurr = filterId in currState;
            if (!inPrev || !inCurr) return true;
            return !valuesDeepEqual(prevState[filterId], currState[filterId]);
        });
        if (changedFilterIds.length === 0) continue;

        console.log('');
        console.log('='.repeat(120));
        console.log(`Prompt: ${prompt}`);
        console.log(`Unchanged: ${allFilterIds.length - changedFilterIds.length}, Changed: ${changedFilterIds.length}`);

        for (const filterId of changedFilterIds) {
            const diffText = jestDiff(prevState[filterId] ?? null, currState[filterId] ?? null, {
                aAnnotation: `${filterId} (previous)`,
                bAnnotation: `${filterId} (current)`,
                expand: false,
            });
            if (!diffText) continue;
            console.log(diffText);
        }
    }
}

await main();

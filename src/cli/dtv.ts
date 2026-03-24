import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import ts from 'typescript';
import { getIntrospectionQuery, buildClientSchema, type GraphQLSchema, type GraphQLNamedType } from 'graphql';
import { collectReachableTypes, renderTsFromSchema, unwrapCollectionElementType } from './typegen/schemaToTs.js';

type DtvTypegenConfig = {
    schema: {
        endpoint: string;
        headers?: Record<string, string>;
    };
    scan: {
        /** Glob patterns for TS/TSX files to scan for DSL.view calls. */
        include: string[];
        /** Glob patterns to ignore. */
        exclude?: string[];
        /** Package specifier to treat as the DTV import. */
        dtvImport?: string;
    };
    output: {
        /** Output file name pattern, written next to each view source file (required). */
        fileNamePattern: string;
    };
    /** Optional scalar overrides: GraphQL scalar name -> TS type expression (e.g. "DateTime": "string"). */
    scalars?: Record<string, string>;

    debug?: {
        /** Include original GraphQL type references as comments in generated output. */
        includeGraphqlTypeComments?: boolean;
    };
};

type ViewInfo = {
    viewId: string;
    collectionName: string;
    sourceFile: string;
};

type ScanDebugOptions = {
    enabled: boolean;
    focusFile?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, context: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${context} must be a non-empty string`);
    }
}

function toPascalCase(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

async function loadConfig(configPath: string): Promise<DtvTypegenConfig> {
    const abs = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);

    const cfg = await (async () => {
        const ext = path.extname(abs).toLowerCase();
        const url = pathToFileURL(abs).href;

        if (ext === '.ts' || ext === '.tsx') {
            // Load TS config in a way that works in both CJS and ESM projects.
            // We transpile the config file to ESM and import the emitted JS.
            // This avoids requiring the consuming repo to be `type: module`.
            const sourceText = await fs.readFile(abs, 'utf8');
            // Under `module: NodeNext`, TS decides ESM vs CJS based on file extension
            // and nearest package.json `type`. We want the config to always be treated
            // as ESM so it can be imported reliably from any project.
            const transpileFileName = abs.replace(/\.(tsx?)$/i, '.mts');
            const transpiled = ts.transpileModule(sourceText, {
                compilerOptions: {
                    target: ts.ScriptTarget.ES2022,
                    module: ts.ModuleKind.NodeNext,
                    moduleResolution: ts.ModuleResolutionKind.NodeNext,
                    jsx: ts.JsxEmit.Preserve,
                    esModuleInterop: true,
                    sourceMap: false
                },
                fileName: transpileFileName,
                reportDiagnostics: true
            });

            if (transpiled.diagnostics?.length) {
                const errors = transpiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
                if (errors.length) {
                    const msg = errors
                        .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
                        .join('\n');
                    throw new Error(`Failed to transpile ${abs}:\n${msg}`);
                }
            }

            const tmpFile = path.join(
                path.dirname(abs),
                `.${path.basename(abs)}.dtv-tmp.${Date.now()}.mjs`
            );

            await fs.writeFile(tmpFile, transpiled.outputText, 'utf8');
            try {
                const tmpUrl = pathToFileURL(tmpFile).href;
                const mod = await import(`${tmpUrl}?t=${Date.now()}`);
                return (mod.default ?? (mod as any).config ?? mod) as unknown;
            } finally {
                await fs.unlink(tmpFile).catch(() => undefined);
            }
        }

        // JS/MJS/CJS (or any Node-supported module) can be imported directly.
        // Cache-bust import to allow repeated runs.
        const mod = await import(`${url}?t=${Date.now()}`);
        return (mod.default ?? (mod as any).config ?? mod) as unknown;
    })();

    if (!isRecord(cfg)) {
        throw new Error('Config must export a plain object (default export recommended)');
    }

    if (!isRecord(cfg.schema)) throw new Error('Config.schema is required');
    assertString(cfg.schema.endpoint, 'Config.schema.endpoint');
    if (cfg.schema.headers !== undefined && !isRecord(cfg.schema.headers)) {
        throw new Error('Config.schema.headers must be an object when provided');
    }

    if (!isRecord(cfg.scan)) throw new Error('Config.scan is required');
    if (!Array.isArray(cfg.scan.include) || cfg.scan.include.length === 0) {
        throw new Error('Config.scan.include must be a non-empty array of glob patterns');
    }
    if (cfg.scan.exclude !== undefined && !Array.isArray(cfg.scan.exclude)) {
        throw new Error('Config.scan.exclude must be an array when provided');
    }
    if (cfg.scan.dtvImport !== undefined) assertString(cfg.scan.dtvImport, 'Config.scan.dtvImport');

    if (!isRecord(cfg.output)) throw new Error('Config.output is required');
    assertString(cfg.output.fileNamePattern, 'Config.output.fileNamePattern');
    if (cfg.output.fileNamePattern.includes('/') || cfg.output.fileNamePattern.includes('\\')) {
        throw new Error('Config.output.fileNamePattern must be a file name (no path separators)');
    }

    if (cfg.scalars !== undefined && !isRecord(cfg.scalars)) {
        throw new Error('Config.scalars must be an object when provided');
    }

    if (cfg.debug !== undefined) {
        if (!isRecord(cfg.debug)) throw new Error('Config.debug must be an object when provided');
        if (cfg.debug.includeGraphqlTypeComments !== undefined && typeof cfg.debug.includeGraphqlTypeComments !== 'boolean') {
            throw new Error('Config.debug.includeGraphqlTypeComments must be a boolean when provided');
        }
    }

    return cfg as DtvTypegenConfig;
}

async function fetchSchema(endpoint: string, headers: Record<string, string>): Promise<GraphQLSchema> {
    const query = getIntrospectionQuery({
        descriptions: true
    });

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...headers
        },
        body: JSON.stringify({ query })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Introspection request failed (${res.status} ${res.statusText}): ${text}`);
    }

    const json = await res.json() as any;
    if (json.errors && Array.isArray(json.errors) && json.errors.length) {
        throw new Error(`Introspection returned errors: ${JSON.stringify(json.errors, null, 2)}`);
    }
    if (!json.data) {
        throw new Error('Introspection response missing data');
    }

    return buildClientSchema(json.data);
}

function findViewsInFile(
    sourceText: string,
    fileName: string,
    dtvImport: string,
    debug?: { log: (line: string) => void }
): ViewInfo[] {
    const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

    const unwrapParens = (expr: ts.Expression): ts.Expression => {
        let cur: ts.Expression = expr;
        while (ts.isParenthesizedExpression(cur)) {
            cur = cur.expression;
        }
        return cur;
    };

    const getDslReceivers = (): { dslIdentifiers: Set<string>; dtvNamespaces: Set<string> } => {
        const dslIdentifiers = new Set<string>();
        const dtvNamespaces = new Set<string>();

        for (const stmt of sourceFile.statements) {
            if (ts.isImportDeclaration(stmt)) {
                if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
                if (stmt.moduleSpecifier.text !== dtvImport) continue;

                const clause = stmt.importClause;
                if (!clause) continue;

                // `import dtv from '...'`
                if (clause.name) {
                    dtvNamespaces.add(clause.name.text);
                }

                const nb = clause.namedBindings;
                if (!nb) continue;
                // `import * as dtv from '...'`
                if (ts.isNamespaceImport(nb)) {
                    dtvNamespaces.add(nb.name.text);
                    continue;
                }
                // `import { DSL as X } from '...'`
                if (ts.isNamedImports(nb)) {
                    for (const el of nb.elements) {
                        const imported = (el.propertyName ?? el.name).text;
                        const local = el.name.text;
                        if (imported === 'DSL') {
                            dslIdentifiers.add(local);
                        }
                    }
                    continue;
                }
            }

            if (ts.isImportEqualsDeclaration(stmt)) {
                const mr = stmt.moduleReference;
                if (!ts.isExternalModuleReference(mr)) continue;
                const expr = mr.expression;
                if (!expr || !ts.isStringLiteral(expr)) continue;
                if (expr.text !== dtvImport) continue;
                dtvNamespaces.add(stmt.name.text);
                continue;
            }

            if (ts.isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    if (!decl.initializer) continue;
                    const init = unwrapParens(decl.initializer);
                    if (!ts.isCallExpression(init)) continue;
                    if (!ts.isIdentifier(init.expression) || init.expression.text !== 'require') continue;
                    const arg0 = init.arguments[0];
                    if (!arg0 || !ts.isStringLiteral(arg0) || arg0.text !== dtvImport) continue;

                    if (ts.isIdentifier(decl.name)) {
                        dtvNamespaces.add(decl.name.text);
                        continue;
                    }
                    if (ts.isObjectBindingPattern(decl.name)) {
                        for (const el of decl.name.elements) {
                            const imported = (el.propertyName ?? el.name);
                            if (ts.isIdentifier(imported) && imported.text === 'DSL') {
                                if (ts.isIdentifier(el.name)) {
                                    dslIdentifiers.add(el.name.text);
                                }
                            }
                        }
                    }
                }
            }
        }

        return { dslIdentifiers, dtvNamespaces };
    };

    const receivers = getDslReceivers();
    if (receivers.dslIdentifiers.size === 0 && receivers.dtvNamespaces.size === 0) {
        debug?.log(`- no matching imports/requires from ${JSON.stringify(dtvImport)}`);
        return [];
    }

    debug?.log(`- dslIdentifiers: ${[...receivers.dslIdentifiers].sort().join(', ') || '(none)'}`);
    debug?.log(`- dtvNamespaces: ${[...receivers.dtvNamespaces].sort().join(', ') || '(none)'}`);

    const views: ViewInfo[] = [];

    const tryGetStringProp = (obj: ts.ObjectLiteralExpression, propName: string): string | null => {
        for (const p of obj.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const name = p.name;
            const key = ts.isIdentifier(name)
                ? name.text
                : ts.isStringLiteral(name)
                    ? name.text
                    : null;
            if (key !== propName) continue;
            if (ts.isStringLiteral(p.initializer)) return p.initializer.text;
            if (ts.isNoSubstitutionTemplateLiteral(p.initializer)) return p.initializer.text;
            return null;
        }
        return null;
    };

    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            if (ts.isPropertyAccessExpression(expr)) {
                const receiver = unwrapParens(expr.expression);
                const method = expr.name.text;

                const isDslReceiver = (() => {
                    if (ts.isIdentifier(receiver) && receivers.dslIdentifiers.has(receiver.text)) return true;
                    if (ts.isPropertyAccessExpression(receiver)) {
                        const maybeNs = unwrapParens(receiver.expression);
                        if (receiver.name.text !== 'DSL') return false;
                        return ts.isIdentifier(maybeNs) && receivers.dtvNamespaces.has(maybeNs.text);
                    }
                    return false;
                })();

                if (method === 'view' && isDslReceiver) {
                    const firstArg = node.arguments[0];
                    if (!firstArg) {
                        debug?.log('- found DSL.view(...) with no args (skipping)');
                    } else if (!ts.isObjectLiteralExpression(firstArg)) {
                        debug?.log('- found DSL.view(<non-object-literal>) (skipping)');
                    } else {
                        const viewId = tryGetStringProp(firstArg, 'id');
                        const collectionName = tryGetStringProp(firstArg, 'collectionName');
                        if (!viewId || !collectionName) {
                            debug?.log(`- found DSL.view({ ... }) but id/collectionName not string literals (id=${viewId ?? 'null'}, collectionName=${collectionName ?? 'null'})`);
                        } else {
                            debug?.log(`- found view id=${JSON.stringify(viewId)} collectionName=${JSON.stringify(collectionName)}`);
                            views.push({
                                viewId,
                                collectionName,
                                sourceFile: fileName
                            });
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return views;
}

async function scanViews(config: DtvTypegenConfig, debug?: ScanDebugOptions): Promise<ViewInfo[]> {
    const dtvImport = config.scan.dtvImport ?? '@kronor/dtv';

    const files = await fg(config.scan.include, {
        ignore: config.scan.exclude ?? [],
        absolute: true,
        onlyFiles: true
    });

    const focusAbs = debug?.focusFile
        ? (path.isAbsolute(debug.focusFile) ? debug.focusFile : path.resolve(process.cwd(), debug.focusFile))
        : undefined;

    if (debug?.enabled) {
        console.log('[dtv typegen] scan debug');
        console.log(`- dtvImport: ${dtvImport}`);
        console.log(`- include: ${JSON.stringify(config.scan.include)}`);
        console.log(`- exclude: ${JSON.stringify(config.scan.exclude ?? [])}`);
        console.log(`- matchedFiles: ${files.length}`);
        if (focusAbs) {
            console.log(`- focusFile: ${focusAbs}`);
            console.log(`- focusFileMatchedByGlob: ${files.map(f => path.resolve(f)).includes(path.resolve(focusAbs))}`);
        }
    }

    const results: ViewInfo[] = [];
    const filesToScan = focusAbs ? files.filter(f => path.resolve(f) === path.resolve(focusAbs)) : files;
    for (const f of filesToScan) {
        if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
        const text = await fs.readFile(f, 'utf8');
        const fileDebug = debug?.enabled
            ? { log: (line: string) => console.log(`[dtv typegen] ${path.resolve(f)} ${line}`) }
            : undefined;
        results.push(...findViewsInFile(text, f, dtvImport, fileDebug));
    }

    // Validate that each view id is unique across the scanned project.
    const byId = new Map<string, ViewInfo[]>();
    for (const v of results) {
        const list = byId.get(v.viewId);
        if (list) list.push(v);
        else byId.set(v.viewId, [v]);
    }

    const duplicates: Array<{ viewId: string; views: ViewInfo[] }> = [];
    for (const [viewId, views] of byId.entries()) {
        if (views.length > 1) duplicates.push({ viewId, views });
    }

    if (duplicates.length) {
        const lines: string[] = [];
        lines.push('Duplicate DTV view ids found (each view `id` must be unique):');
        for (const d of duplicates.sort((a, b) => a.viewId.localeCompare(b.viewId))) {
            lines.push(`- ${d.viewId}`);
            for (const v of d.views) {
                lines.push(`  - ${path.resolve(v.sourceFile)}`);
            }
        }
        throw new Error(lines.join('\n'));
    }

    return results;
}

async function writeFileEnsuringDir(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}

function singleQuoteStringLiteral(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function renderDefaultConfigTs(options: {
    endpoint: string;
    fileNamePattern: string;
    include: string[];
    exclude: string[];
    dtvImport: string;
}): string {
    const stringifyArray = (items: string[]) => {
        const outerIndent = '        ';
        const innerIndent = '            ';
        return `[
${items.map(v => `${innerIndent}${JSON.stringify(v)}`).join(',\n')}
${outerIndent}]`;
    };

    return [
        "import type { DtvTypegenConfig } from '@kronor/dtv/typegen';",
        '',
        'const config: DtvTypegenConfig = {',
        '    schema: {',
        `        endpoint: ${JSON.stringify(options.endpoint)},`,
        '        headers: {',
        '            // Example header-based auth:',
        '            // Authorization: `Bearer ${process.env.HASURA_TOKEN}`,',
        '',
        '            // Hasura admin secret:',
        "            // 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET ?? '',",
        '        }',
        '    },',
        '',
        '    scan: {',
        '        // Scan TS/TSX files for `DSL.view({ ... })` calls (supports aliased/namespaced imports too)',
        `        include: ${stringifyArray(options.include)},`,
        `        exclude: ${stringifyArray(options.exclude)},`,
        '',
        '        // Override if you re-export DTV under a different specifier.',
        `        dtvImport: ${JSON.stringify(options.dtvImport)}`,
        '    },',
        '',
        '    output: {',
        '        // File name written next to each view module that calls DSL.view(...)',
        `        fileNamePattern: ${JSON.stringify(options.fileNamePattern)}`,
        '    },',
        '',
        '    scalars: {',
        "        // DateTime: 'string'",
        '    }',
        '',
        '    debug: {',
        '        // When true, include original GraphQL type refs as comments',
        '        includeGraphqlTypeComments: false',
        '    }',
        '};',
        '',
        'export default config;',
        ''
    ].join('\n');
}

async function runInitConfig(outPath: string, force: boolean, overrides?: Partial<{
    endpoint: string;
    fileNamePattern: string;
    dtvImport: string;
}>) {
    const absOut = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath);
    if (!force && await fileExists(absOut)) {
        throw new Error(`Refusing to overwrite existing file: ${absOut} (use --force to overwrite)`);
    }

    const content = renderDefaultConfigTs({
        endpoint: overrides?.endpoint ?? 'https://my-hasura.example.com/v1/graphql',
        fileNamePattern: overrides?.fileNamePattern ?? 'dtv.generated.{viewId}.ts',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['**/*.test.*', '**/node_modules/**'],
        dtvImport: overrides?.dtvImport ?? '@kronor/dtv'
    });

    await writeFileEnsuringDir(absOut, content);
    console.log(`Wrote ${absOut}`);
}

function applyFileNamePattern(pattern: string, view: { viewId: string; collectionName: string }): string {
    return pattern
        .replace(/\{viewId\}/g, view.viewId)
        .replace(/\{collectionName\}/g, view.collectionName);
}

function toIdentifier(pascal: string): string {
    if (/^[A-Za-z_]/.test(pascal)) return pascal;
    return `_${pascal}`;
}

function getColumnDefinitionsArray(argObject: ts.ObjectLiteralExpression): ts.ArrayLiteralExpression | null {
    for (const p of argObject.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const name = p.name;
        const key = ts.isIdentifier(name)
            ? name.text
            : ts.isStringLiteral(name)
                ? name.text
                : null;
        if (key !== 'columnDefinitions') continue;
        return ts.isArrayLiteralExpression(p.initializer) ? p.initializer : null;
    }
    return null;
}

function hasRowTypeProp(obj: ts.ObjectLiteralExpression): boolean {
    for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const name = p.name;
        const key = ts.isIdentifier(name)
            ? name.text
            : ts.isStringLiteral(name)
                ? name.text
                : null;
        if (key === 'rowType') return true;
    }
    return false;
}

function applyTextEdits(original: string, edits: Array<{ pos: number; insert: string }>): string {
    const sorted = [...edits].sort((a, b) => b.pos - a.pos);
    let out = original;
    for (const e of sorted) {
        out = out.slice(0, e.pos) + e.insert + out.slice(e.pos);
    }
    return out;
}

function ensureRowTypeImport(sourceText: string, sourceFile: ts.SourceFile, importName: string, importPathNoExt: string): { updatedText: string; changed: boolean } {
    for (const stmt of sourceFile.statements) {
        if (!ts.isImportDeclaration(stmt)) continue;
        if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
        if (stmt.moduleSpecifier.text !== importPathNoExt) continue;

        const nb = stmt.importClause?.namedBindings;
        if (!nb || !ts.isNamedImports(nb)) {
            // Import exists but is not a named import; don't try to be clever.
            return { updatedText: sourceText, changed: false };
        }

        if (nb.elements.some(e => e.name.text === importName)) {
            return { updatedText: sourceText, changed: false };
        }

        const insertPos = nb.getEnd() - 1; // before `}`
        const insert = `${nb.elements.length ? ', ' : ' '}${importName}`;
        return { updatedText: applyTextEdits(sourceText, [{ pos: insertPos, insert }]), changed: true };
    }

    const importStmts = sourceFile.statements.filter(ts.isImportDeclaration);
    const insertPos = importStmts.length
        ? importStmts[importStmts.length - 1].end
        : 0;

    const prefix = insertPos === 0 ? '' : '\n';
    const importLine = `${prefix}import { ${importName} } from ${JSON.stringify(importPathNoExt)};\n`;
    return {
        updatedText: applyTextEdits(sourceText, [{ pos: insertPos, insert: importLine }]),
        changed: true
    };
}

function patchInlineColumnsWithRowType(args: {
    sourceText: string;
    sourceFile: ts.SourceFile;
    viewArgObject: ts.ObjectLiteralExpression;
    rowTypeIdentifier: string;
    dslIdentifiers: Set<string>;
    dtvNamespaces: Set<string>;
}): { updatedText: string; changed: boolean; patchedCount: number } {
    const cols = getColumnDefinitionsArray(args.viewArgObject);
    if (!cols) return { updatedText: args.sourceText, changed: false, patchedCount: 0 };

    const edits: Array<{ pos: number; insert: string }> = [];
    let patchedCount = 0;

    for (const el of cols.elements) {
        if (!ts.isCallExpression(el)) continue;

        const expr = el.expression;
        if (!ts.isPropertyAccessExpression(expr)) continue;
        if (expr.name.text !== 'column') continue;

        const receiver = expr.expression;
        const isDtvColumn = (() => {
            if (ts.isIdentifier(receiver) && args.dslIdentifiers.has(receiver.text)) return true;
            if (ts.isPropertyAccessExpression(receiver)) {
                if (receiver.name.text !== 'DSL') return false;
                const maybeNs = receiver.expression;
                return ts.isIdentifier(maybeNs) && args.dtvNamespaces.has(maybeNs.text);
            }
            return false;
        })();
        if (!isDtvColumn) continue;

        const firstArg = el.arguments[0];
        if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) continue;
        if (hasRowTypeProp(firstArg)) continue;

        const firstProp = firstArg.properties[0];
        const insertPos = firstProp ? firstProp.getStart(args.sourceFile, false) : firstArg.getEnd() - 1;
        const between = args.sourceText.slice(firstArg.getStart(args.sourceFile, false) + 1, insertPos);
        const isMultiline = between.includes('\n');

        if (!isMultiline) {
            edits.push({ pos: insertPos, insert: `rowType: ${args.rowTypeIdentifier}, ` });
            patchedCount += 1;
            continue;
        }

        const lineStart = args.sourceText.lastIndexOf('\n', insertPos - 1) + 1;
        const before = args.sourceText.slice(lineStart, insertPos);
        const indentMatch = before.match(/^[ \t]*/);
        const indent = indentMatch ? indentMatch[0] : '';

        edits.push({ pos: insertPos, insert: `${indent}rowType: ${args.rowTypeIdentifier},\n` });
        patchedCount += 1;
    }

    if (edits.length === 0) {
        return { updatedText: args.sourceText, changed: false, patchedCount: 0 };
    }

    return {
        updatedText: applyTextEdits(args.sourceText, edits),
        changed: true,
        patchedCount
    };
}

async function runTypegen(configPath: string, debug?: ScanDebugOptions, onlyViewId?: string) {
    const config = await loadConfig(configPath);

    const dtvImport = config.scan.dtvImport ?? '@kronor/dtv';

    const views = await scanViews(config, debug);
    if (views.length === 0) {
        throw new Error('No views found. Ensure Config.scan.include matches files that import DSL from your configured DTV specifier and call DSL.view({ ... }).');
    }

    const selectedViews = onlyViewId
        ? views.filter(v => v.viewId === onlyViewId)
        : views;

    if (onlyViewId && selectedViews.length === 0) {
        const sample = views.map(v => v.viewId).slice(0, 25);
        throw new Error(
            `No view found with id ${JSON.stringify(onlyViewId)}. `
            + `Sample discovered view ids: ${sample.join(', ')}${sample.length === 25 ? ', ...' : ''}`
        );
    }

    const schema = await fetchSchema(config.schema.endpoint, config.schema.headers ?? {});
    const queryType = schema.getQueryType();
    if (!queryType) throw new Error('Schema has no Query type');
    const queryFields = queryType.getFields();

    // Resolve view -> row type
    const viewRows = selectedViews.map(v => {
        const f = queryFields[v.collectionName];
        if (!f) {
            const sample = Object.keys(queryFields).slice(0, 25);
            throw new Error(
                `View "${v.viewId}" references collectionName "${v.collectionName}" but it was not found on Query. `
                + `Sample Query fields: ${sample.join(', ')}${sample.length === 25 ? ', ...' : ''}`
            );
        }
        const rowNamed = unwrapCollectionElementType(f.type);
        return {
            ...v,
            rowTypeName: rowNamed.name
        };
    });

    const outputFiles = new Set<string>();
    for (const v of viewRows) {
        const root = schema.getType(v.rowTypeName);
        if (!root || Array.isArray(root)) {
            throw new Error(`Could not resolve row type "${v.rowTypeName}" in schema for view "${v.viewId}"`);
        }

        const reachable = collectReachableTypes(schema, [root as GraphQLNamedType]);
        const viewTypeName = `${toIdentifier(toPascalCase(v.viewId))}Row`;
        const rowTypeConstName = `${toIdentifier(toPascalCase(v.viewId))}RowType`;

        const fileName = applyFileNamePattern(config.output.fileNamePattern, v);
        if (!fileName.endsWith('.ts')) {
            throw new Error(`Config.output.fileNamePattern must produce a .ts file name. Got: ${fileName}`);
        }

        const outFile = path.join(path.dirname(v.sourceFile), fileName);
        if (outputFiles.has(outFile)) {
            throw new Error(`Multiple views would write the same output file: ${outFile}`);
        }
        outputFiles.add(outFile);

        const content = [
            `import { DSL as DTV } from ${singleQuoteStringLiteral(dtvImport)};`,
            '',
            renderTsFromSchema(reachable, {
                scalars: config.scalars,
                includeGraphqlTypeComments: config.debug?.includeGraphqlTypeComments === true,
                exportTypes: false
            }).trimEnd(),
            '',
            `export type ${viewTypeName} = ${v.rowTypeName};`,
            `export const ${rowTypeConstName} = DTV.rowType<${viewTypeName}>();`,
            ''
        ].join('\n');

        await writeFileEnsuringDir(outFile, content);

        // Best-effort: patch inline `DTV.column({ ... })` calls in the view module
        // to include `rowType: <ViewRowTypeConst>`.
        try {
            const viewText = await fs.readFile(v.sourceFile, 'utf8');
            const sf = ts.createSourceFile(v.sourceFile, viewText, ts.ScriptTarget.Latest, true);

            // Reuse the same import/require detection strategy as view scanning.
            // (Local to this patching block to keep changes minimal.)
            const dslIdentifiers = new Set<string>();
            const dtvNamespaces = new Set<string>();
            for (const stmt of sf.statements) {
                if (ts.isImportDeclaration(stmt)) {
                    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
                    if (stmt.moduleSpecifier.text !== dtvImport) continue;
                    const clause = stmt.importClause;
                    if (!clause) continue;
                    if (clause.name) dtvNamespaces.add(clause.name.text);
                    const nb = clause.namedBindings;
                    if (!nb) continue;
                    if (ts.isNamespaceImport(nb)) {
                        dtvNamespaces.add(nb.name.text);
                        continue;
                    }
                    if (ts.isNamedImports(nb)) {
                        for (const el of nb.elements) {
                            const imported = (el.propertyName ?? el.name).text;
                            const local = el.name.text;
                            if (imported === 'DSL') dslIdentifiers.add(local);
                        }
                    }
                }
                if (ts.isImportEqualsDeclaration(stmt)) {
                    const mr = stmt.moduleReference;
                    if (!ts.isExternalModuleReference(mr)) continue;
                    const expr = mr.expression;
                    if (!expr || !ts.isStringLiteral(expr)) continue;
                    if (expr.text !== dtvImport) continue;
                    dtvNamespaces.add(stmt.name.text);
                }
                if (ts.isVariableStatement(stmt)) {
                    for (const decl of stmt.declarationList.declarations) {
                        if (!decl.initializer) continue;
                        if (!ts.isCallExpression(decl.initializer)) continue;
                        if (!ts.isIdentifier(decl.initializer.expression) || decl.initializer.expression.text !== 'require') continue;
                        const arg0 = decl.initializer.arguments[0];
                        if (!arg0 || !ts.isStringLiteral(arg0) || arg0.text !== dtvImport) continue;

                        if (ts.isIdentifier(decl.name)) {
                            dtvNamespaces.add(decl.name.text);
                        } else if (ts.isObjectBindingPattern(decl.name)) {
                            for (const el of decl.name.elements) {
                                const imported = (el.propertyName ?? el.name);
                                if (ts.isIdentifier(imported) && imported.text === 'DSL') {
                                    if (ts.isIdentifier(el.name)) dslIdentifiers.add(el.name.text);
                                }
                            }
                        }
                    }
                }
            }

            // Locate the view call object literal for this view id.
            let viewArgObject: ts.ObjectLiteralExpression | null = null;
            const visit = (node: ts.Node) => {
                if (viewArgObject) return;
                if (ts.isCallExpression(node)) {
                    const expr = node.expression;
                    if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'view') {
                        const receiver = expr.expression;
                        const isDslReceiver = (() => {
                            if (ts.isIdentifier(receiver) && dslIdentifiers.has(receiver.text)) return true;
                            if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'DSL') {
                                const maybeNs = receiver.expression;
                                return ts.isIdentifier(maybeNs) && dtvNamespaces.has(maybeNs.text);
                            }
                            return false;
                        })();
                        if (!isDslReceiver) {
                            // keep searching
                        } else {
                            const firstArg = node.arguments[0];
                            if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
                                const idProp = firstArg.properties.find(p => ts.isPropertyAssignment(p)
                                    && ((ts.isIdentifier(p.name) && p.name.text === 'id')
                                        || (ts.isStringLiteral(p.name) && p.name.text === 'id'))
                                ) as ts.PropertyAssignment | undefined;
                                const idVal = idProp?.initializer;
                                const id = idVal && (ts.isStringLiteral(idVal) || ts.isNoSubstitutionTemplateLiteral(idVal))
                                    ? idVal.text
                                    : null;
                                if (id === v.viewId) {
                                    viewArgObject = firstArg;
                                    return;
                                }
                            }
                        }
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(sf);
            if (!viewArgObject) {
                continue;
            }

            const importPathNoExt = './' + fileName.replace(/\.ts$/i, '');
            const withImport = ensureRowTypeImport(viewText, sf, rowTypeConstName, importPathNoExt);
            const sf2 = ts.createSourceFile(v.sourceFile, withImport.updatedText, ts.ScriptTarget.Latest, true);

            // Re-find the view object in the updated source.
            let viewArgObject2: ts.ObjectLiteralExpression | null = null;
            const visit2 = (node: ts.Node) => {
                if (viewArgObject2) return;
                if (ts.isCallExpression(node)) {
                    const expr = node.expression;
                    if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'view') {
                        const firstArg = node.arguments[0];
                        if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
                            const idProp = firstArg.properties.find(p => ts.isPropertyAssignment(p)
                                && ((ts.isIdentifier(p.name) && p.name.text === 'id')
                                    || (ts.isStringLiteral(p.name) && p.name.text === 'id'))
                            ) as ts.PropertyAssignment | undefined;
                            const idVal = idProp?.initializer;
                            const id = idVal && (ts.isStringLiteral(idVal) || ts.isNoSubstitutionTemplateLiteral(idVal))
                                ? idVal.text
                                : null;
                            if (id === v.viewId) {
                                viewArgObject2 = firstArg;
                                return;
                            }
                        }
                    }
                }
                ts.forEachChild(node, visit2);
            };
            visit2(sf2);
            if (!viewArgObject2) {
                continue;
            }

            const patched = patchInlineColumnsWithRowType({
                sourceText: withImport.updatedText,
                sourceFile: sf2,
                viewArgObject: viewArgObject2,
                rowTypeIdentifier: rowTypeConstName,
                dslIdentifiers,
                dtvNamespaces
            });

            if (withImport.changed || patched.changed) {
                await fs.writeFile(v.sourceFile, patched.updatedText, 'utf8');
            }
        } catch {
            // Ignore patching errors; generation still succeeds.
        }
    }

    if (onlyViewId) {
        console.log(`Generated types for view ${JSON.stringify(onlyViewId)}.`);
    } else {
        console.log(`Generated types for ${viewRows.length} view(s).`);
    }
}

const program = new Command();
program
    .name('dtv')
    .description('DTV CLI')
    .version('0.0.0');

program
    .command('typegen')
    .description('Generate TypeScript types from a Hasura GraphQL schema')
    .argument('[viewId]', 'Optional view id to generate types for (only that view will be regenerated)')
    .option('-c, --config <path>', 'Path to dtv.config.ts', 'dtv.config.ts')
    .option('--debug-scan', 'Print view scanning debug information', false)
    .option('--debug-scan-file <path>', 'Only scan a specific file and print debug output for it')
    .action(async (viewId: string | undefined, opts: { config: string; debugScan?: boolean; debugScanFile?: string }) => {
        try {
            await runTypegen(
                opts.config,
                {
                    enabled: Boolean(opts.debugScan || opts.debugScanFile),
                    focusFile: opts.debugScanFile
                },
                viewId
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(msg);
            process.exitCode = 1;
        }
    });

program
    .command('init')
    .description('Generate a dtv.config.ts template in the current project')
    .option('-o, --out <path>', 'Output config file path', 'dtv.config.ts')
    .option('--force', 'Overwrite if the file already exists', false)
    .option('--endpoint <url>', 'Hasura GraphQL endpoint to prefill', 'https://my-hasura.example.com/v1/graphql')
    .option('--file-pattern <pattern>', 'Output file name pattern written next to each view module', 'dtv.generated.{viewId}.ts')
    .option('--dtv-import <specifier>', 'Module specifier used by views to import DSL', '@kronor/dtv')
    .action(async (opts: { out: string; force: boolean; endpoint: string; filePattern: string; dtvImport: string }) => {
        try {
            await runInitConfig(opts.out, opts.force, {
                endpoint: opts.endpoint,
                fileNamePattern: opts.filePattern,
                dtvImport: opts.dtvImport
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(msg);
            process.exitCode = 1;
        }
    });

program.parse(process.argv);

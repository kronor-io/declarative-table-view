import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import ts from 'typescript';
import type { DtvTypegenConfig } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, context: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${context} must be a non-empty string`);
    }
}

export async function loadConfig(configPath: string): Promise<DtvTypegenConfig> {
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

import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import ts from 'typescript';
import type { DtvSchemaConfig, DtvTypegenConfig } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, context: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${context} must be a non-empty string`);
    }
}

/** The object a config module exports. */
async function importConfig(abs: string): Promise<Record<string, unknown>> {
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
    return cfg;
}

function validateSchema(schema: unknown): DtvSchemaConfig {
    if (!isRecord(schema)) throw new Error('Config.schema is required');
    assertString(schema.endpoint, 'Config.schema.endpoint');
    if (schema.headers !== undefined && !isRecord(schema.headers)) {
        throw new Error('Config.schema.headers must be an object when provided');
    }
    return schema as DtvSchemaConfig;
}

/** The schema typegen reads; a function giving it is called now. */
export async function resolveSchema(config: DtvTypegenConfig): Promise<DtvSchemaConfig> {
    return validateSchema(typeof config.schema === 'function' ? await config.schema() : config.schema);
}

function validateScan(cfg: Record<string, unknown>): void {
    if (!isRecord(cfg.scan)) throw new Error('Config.scan is required');
    if (!Array.isArray(cfg.scan.include) || cfg.scan.include.length === 0) {
        throw new Error('Config.scan.include must be a non-empty array of glob patterns');
    }
    if (cfg.scan.exclude !== undefined && !Array.isArray(cfg.scan.exclude)) {
        throw new Error('Config.scan.exclude must be an array when provided');
    }
    if (cfg.scan.dtvImport !== undefined) assertString(cfg.scan.dtvImport, 'Config.scan.dtvImport');
}

const absolute = (configPath: string) => path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);

export type DtvDefinitionsConfig = {
    scan: { include: string[]; exclude: string[]; dtvImport: string };
    definitions: NonNullable<DtvTypegenConfig['definitions']>;
    /** The folder of the config file, which relative paths in it are from. */
    root: string;
};

/**
 * What `dtv definitions` needs of the config: how to find the views, and its own section. Without
 * a config file, all TS sources are scanned for views.
 */
export async function loadDefinitionsConfig(configPath: string): Promise<DtvDefinitionsConfig> {
    const abs = absolute(configPath);
    const root = path.dirname(abs);
    const exists = await fs.access(abs).then(() => true, () => false);
    if (!exists) {
        return { scan: { include: ['**/*.{ts,tsx}'], exclude: [], dtvImport: '@kronor/dtv' }, definitions: {}, root };
    }

    let cfg: Record<string, unknown>;
    try {
        cfg = await importConfig(abs);
    } catch (err) {
        throw new Error(
            `Failed to load ${configPath}: ${err instanceof Error ? err.message : String(err)}\n` +
            'If it fails for want of what only typegen needs (e.g. a secret for the schema), make `schema` a function: ' +
            'it is called by `dtv typegen` only.'
        );
    }
    validateScan(cfg);
    const scan = cfg.scan as DtvTypegenConfig['scan'];

    const definitions = cfg.definitions === undefined ? {} : cfg.definitions;
    if (!isRecord(definitions)) throw new Error('Config.definitions must be an object when provided');
    if (definitions.factories !== undefined) {
        if (!isRecord(definitions.factories)) throw new Error('Config.definitions.factories must be an object when provided');
        for (const [name, factory] of Object.entries(definitions.factories)) {
            if (!isRecord(factory)) throw new Error(`Config.definitions.factories["${name}"] must be an object`);
            if (factory.definition !== undefined) assertString(factory.definition, `Config.definitions.factories["${name}"].definition`);
            if (factory.args !== undefined && !Array.isArray(factory.args)) throw new Error(`Config.definitions.factories["${name}"].args must be an array`);
        }
    }
    if (definitions.migrationsDir !== undefined) assertString(definitions.migrationsDir, 'Config.definitions.migrationsDir');
    if (definitions.viteConfig !== undefined) assertString(definitions.viteConfig, 'Config.definitions.viteConfig');

    return {
        scan: { include: scan.include, exclude: scan.exclude ?? [], dtvImport: scan.dtvImport ?? '@kronor/dtv' },
        definitions: definitions as DtvDefinitionsConfig['definitions'],
        root
    };
}

export async function loadConfig(configPath: string): Promise<DtvTypegenConfig> {
    const cfg = await importConfig(absolute(configPath));

    if (typeof cfg.schema !== 'function') validateSchema(cfg.schema);

    validateScan(cfg);

    if (!isRecord(cfg.output)) throw new Error('Config.output is required');
    assertString(cfg.output.fileNamePattern, 'Config.output.fileNamePattern');
    if (cfg.output.fileNamePattern.includes('/') || cfg.output.fileNamePattern.includes('\\')) {
        throw new Error('Config.output.fileNamePattern must be a file name (no path separators)');
    }

    if (cfg.scalars !== undefined && !isRecord(cfg.scalars)) {
        throw new Error('Config.scalars must be an object when provided');
    }

    if (cfg.immutableTypes !== undefined && typeof cfg.immutableTypes !== 'boolean') {
        throw new Error('Config.immutableTypes must be a boolean when provided');
    }

    if (cfg.debug !== undefined) {
        if (!isRecord(cfg.debug)) throw new Error('Config.debug must be an object when provided');
        if (cfg.debug.includeGraphqlTypeComments !== undefined && typeof cfg.debug.includeGraphqlTypeComments !== 'boolean') {
            throw new Error('Config.debug.includeGraphqlTypeComments must be a boolean when provided');
        }
    }

    return cfg as DtvTypegenConfig;
}

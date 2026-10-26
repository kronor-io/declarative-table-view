import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import type { DtvDefinitionsConfig } from '../config/loadConfig.js';
import { discoverViews, scanViewModules, type DiscoveredExport } from './discover.js';
import { projectDefinition, resolveDefinitions, type BuiltExport } from './resolve.js';
import { MIGRATIONS_FOLDER, type DefinitionsProject, type LoadedView, type ViewMigrationChain, type ViewTooling } from './types.js';

/*
 * The project's view definitions: the modules calling `DSL.view` (./discover), their exports
 * that are views or make one, built with arguments made up from their parameter types unless
 * the config gives them, and made definitions of (./resolve). Modules are loaded by
 * `loadModule`: the project's Vite for the CLI (./loadProject), anything that evaluates them
 * the way the app does elsewhere.
 */

export type BuildProjectArgs = {
    cwd: string;
    config: DtvDefinitionsConfig;
    /** Evaluates a module of the project (a file, or the specifier of its @kronor/dtv). */
    loadModule: (id: string) => Promise<Record<string, unknown>>;
    /** Releases what loading modules took. */
    close: () => Promise<void>;
};

/** Never part of the project's own sources. */
const IGNORED = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/.git/**'];

async function exists(file: string): Promise<boolean> {
    return fs.access(file).then(() => true, () => false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds a view. What the factory logs is dropped: arguments made up from parameter types
 * are odd (e.g. `'x1'` for a date), and code complaining about them is noise. A build that
 * fails says why in its error.
 */
function build(make: () => unknown): BuiltExport['builds'][number] {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const saved = methods.map(method => console[method]);
    methods.forEach(method => { console[method] = () => undefined; });
    try {
        const view = make();
        return isRecord(view) && typeof view.id === 'string'
            ? { view: view as LoadedView }
            : { error: 'it did not return a view' };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    } finally {
        methods.forEach((method, index) => { console[method] = saved[index]; });
    }
}

export async function buildProject(args: BuildProjectArgs): Promise<DefinitionsProject> {
    const { cwd, config, loadModule } = args;
    const relative = (file: string) => path.relative(cwd, file).split(path.sep).join('/');

    const modules = await scanViewModules(cwd, config.scan.include, config.scan.exclude, config.scan.dtvImport);
    const discovery = discoverViews(cwd, modules);

    const dtv = await loadModule(config.scan.dtvImport);
    if (typeof dtv.projectView !== 'function' || typeof dtv.checkMigration !== 'function') {
        throw new Error(`The project's ${config.scan.dtvImport} has no view migration support; update it to the version of this CLI`);
    }
    const tooling = dtv as unknown as ViewTooling;

    const problems: string[] = discovery.unreachable.map(file =>
        `${relative(file)}: calls DSL.view, but none of its exports is a view or returns one, so dtv definitions cannot build it`);

    const factories = config.definitions.factories ?? {};
    const used = new Set<string>();
    const exportsNamed = (name: string) => discovery.exports.filter(found => found.exportName === name).length;
    const configFor = (found: DiscoveredExport) => {
        const qualified = `${relative(found.file)}#${found.exportName}`;
        if (factories[qualified] !== undefined) {
            used.add(qualified);
            return { key: qualified, config: factories[qualified] };
        }
        if (factories[found.exportName] !== undefined) {
            used.add(found.exportName);
            if (exportsNamed(found.exportName) > 1) {
                problems.push(`definitions.factories["${found.exportName}"] matches several exports; name one as "${qualified}"`);
                return { key: qualified, config: undefined };
            }
            return { key: found.exportName, config: factories[found.exportName] };
        }
        return { key: exportsNamed(found.exportName) > 1 ? qualified : found.exportName, config: undefined };
    };

    const built: BuiltExport[] = [];
    for (const found of discovery.exports) {
        const label = `${found.exportName} (${relative(found.file)})`;
        let module: Record<string, unknown>;
        try {
            module = await loadModule(found.file);
        } catch (err) {
            problems.push(`${label}: its module fails to load (${err instanceof Error ? err.message : String(err)})`);
            continue;
        }
        const exported = module[found.exportName];
        const { key, config: factoryConfig } = configFor(found);
        const item = { label, configKey: key, source: found.file, definition: factoryConfig?.definition };

        if (found.kind === 'constant') {
            built.push({ ...item, generated: false, builds: [build(() => exported)] });
        } else if (typeof exported !== 'function') {
            problems.push(`${label}: is not a function when loaded`);
        } else if (factoryConfig?.args !== undefined) {
            const configuredArgs = factoryConfig.args;
            built.push({ ...item, generated: false, builds: [build(() => exported(...configuredArgs))] });
        } else {
            built.push({
                ...item,
                generated: true,
                builds: [build(() => exported(...found.args.minimal())), build(() => exported(...found.args.contrasting()))]
            });
        }
    }

    for (const key of Object.keys(factories)) {
        if (!used.has(key)) problems.push(`definitions.factories["${key}"] matches no export of a module calling DSL.view`);
    }

    const resolved = resolveDefinitions(built, (view, definition) => tooling.projectView(view, definition, 1));

    return {
        definitions: resolved.definitions,
        problems: [...problems, ...resolved.problems],
        tooling,
        projectDefinition: (definition, revision) => projectDefinition(resolved.definitions[definition], definition, revision, tooling.projectView),
        async findChainFolders(): Promise<string[]> {
            const indexes = await fg(`**/${MIGRATIONS_FOLDER}/*/index.ts`, { cwd, ignore: IGNORED, absolute: true, onlyFiles: true });
            return indexes.map(index => path.dirname(path.normalize(index))).sort();
        },
        async loadChain(folder: string): Promise<ViewMigrationChain | null> {
            const index = path.join(folder, 'index.ts');
            if (!(await exists(index))) return null;
            const loaded = await loadModule(index);
            return (loaded.default ?? null) as ViewMigrationChain | null;
        },
        close: args.close
    };
}

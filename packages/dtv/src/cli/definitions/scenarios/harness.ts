import { jest } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import ts from 'typescript';
import type { DtvDefinitionsConfig } from '../../config/loadConfig';
import { buildProject } from '../project';
import { runCheck, runMigrate, type CheckReport, type DefinitionsOptions, type MigrateOptions } from '../run';
import type { DefinitionsProject } from '../types';
import type { UserData, ViewResets } from '../../../framework/user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from '../../../framework/user-data.migrations';
import type * as Dtv from './dtv';

/*
 * The harness of the scenario tests: a project of its own in a temporary folder, with view
 * modules written by the test, on which `dtv definitions` runs as it does in an app — the
 * project's TypeScript finds the views, its modules are evaluated, migrations are generated,
 * views are wired up, `check` checks — and on whose user data dtv's runtime then runs the
 * generated migrations.
 *
 * Modules are evaluated by Jest (ts-jest) rather than by the project's Vite; `@kronor/dtv`
 * is dtv's own sources (./dtv). Each `load()` evaluates them afresh, as after a rebuild.
 */

const SHIM = path.join(__dirname, 'dtv.ts');

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/* View modules */

export type FilterSource = string;
export type ColumnSource = string;

const literal = (value: unknown) => JSON.stringify(value).replace(/"/g, "'");

export const filters = {
    text: (id: string, field = id): FilterSource =>
        `{ id: ${literal(id)}, label: ${literal(id)}, aiGenerated: false, expression: { type: 'equals', field: ${literal(field)}, value: { type: 'text' } } }`,
    number: (id: string, field = id, cmp = 'equals'): FilterSource =>
        `{ id: ${literal(id)}, label: ${literal(id)}, aiGenerated: false, expression: { type: ${literal(cmp)}, field: ${literal(field)}, value: { type: 'number' } } }`,
    dateRange: (id: string, field = id): FilterSource =>
        `{ id: ${literal(id)}, label: ${literal(id)}, aiGenerated: false, expression: { type: 'and', filters: [` +
        `{ type: 'greaterThanOrEqual', field: ${literal(field)}, value: { type: 'date' } }, ` +
        `{ type: 'lessThanOrEqual', field: ${literal(field)}, value: { type: 'date' } }] } }`,
    multiselect: (id: string, field = id, items: string[] = ['PAID', 'OPEN']): FilterSource =>
        `{ id: ${literal(id)}, label: ${literal(id)}, aiGenerated: false, expression: { type: 'in', field: ${literal(field)}, value: { type: 'multiselect', items: ${literal(items.map(item => ({ label: item, value: item })))} } } }`,
    customOperator: (id: string, field = id, operators: string[] = ['contains', 'equals']): FilterSource =>
        `{ id: ${literal(id)}, label: ${literal(id)}, aiGenerated: false, expression: { type: 'equals', field: ${literal(field)}, ` +
        `value: { type: 'customOperator', operators: ${literal(operators.map(operator => ({ label: operator, value: operator })))}, valueControl: { type: 'text' } }, ` +
        `transform: { toQuery: (input: any) => ({ condition: { kind: 'empty' } }) } } }`
};

export const columns = {
    of: (id: string, field = id): ColumnSource =>
        `{ type: 'tableColumn', id: ${literal(id)}, name: ${literal(id)}, data: [{ type: 'valueQuery', field: ${literal(field)} }], cellRenderer: () => null }`
};

/** A module exporting the view `id` as `exportName`, or a factory of it taking `args` and making its id with `idExpression`. */
export function viewModule(args: {
    id: string;
    exportName: string;
    filters: FilterSource[];
    columns?: ColumnSource[];
    /** A factory instead of a view: its parameters, e.g. `(subsidiaryId?: number)`. */
    factory?: { parameters: string; idExpression: string };
}): string {
    const body = [
        '{',
        `    id: ${args.factory?.idExpression ?? literal(args.id)},`,
        `    title: ${literal(args.id)},`,
        `    source: { type: 'collection', collectionName: ${literal(args.id)} },`,
        "    boolExpType: 'BoolExp',",
        "    orderByType: '[OrderBy!]',",
        "    paginationKey: 'id',",
        `    columnDefinitions: [${(args.columns ?? [columns.of('id')]).join(', ')}],`,
        `    filterGroups: [{ name: 'default', label: null, filters: [`,
        ...args.filters.map(filter => `        ${filter},`),
        '    ] }],',
        '}'
    ].join('\n');
    return [
        "import { DSL, type View } from '@kronor/dtv';",
        '',
        args.factory === undefined
            ? `export const ${args.exportName}: View = DSL.view(${body});`
            : `export const ${args.exportName} = ${args.factory.parameters}: View => DSL.view(${body});`,
        ''
    ].join('\n');
}

/** A view module of `viewModule` with other filters, keeping everything else (e.g. its wiring). */
export function withFilters(source: string, viewFilters: FilterSource[]): string {
    const start = source.indexOf("filters: [\n") + "filters: [\n".length;
    const end = source.indexOf('    ] }],', start);
    return source.slice(0, start) + viewFilters.map(filter => `        ${filter},\n`).join('') + source.slice(end);
}

/* Stored user data */

export const leaf = (value: Json) => ({ type: 'leaf', value: { type: 'value', value } });
export const emptyLeaf = { type: 'leaf', value: { type: 'empty' } };
export const both = (...children: unknown[]) => ({ type: 'and', children });

export type StoredView = {
    definitionRevision?: number;
    hiddenColumns?: string[];
    ordering?: { field: string; direction: 'ASC' | 'DESC' } | null;
    persistedFilterState?: Record<string, unknown> | null;
    savedFilters?: Array<{ name: string; state: Record<string, unknown> }>;
};

/** User data as an app stores it, at dtv's current format revision. */
export function storedUserData(views: Record<string, StoredView>, formatRevision: string = CURRENT_USERDATA_FORMAT_REVISION): Json {
    return {
        preferences: { syncFilterStateToUrlOverride: null, closeFilterPanelOnApply: false },
        revision: 1,
        formatRevision,
        views: Object.fromEntries(Object.entries(views).map(([viewId, view]) => [viewId, {
            columnOrder: null,
            hiddenColumns: view.hiddenColumns ?? [],
            rowsPerPage: null,
            syncOrderingToUserData: true,
            ordering: view.ordering ?? null,
            syncFilterStateToUserData: true,
            persistedFilterState: (view.persistedFilterState ?? null) as Json,
            savedFilters: (view.savedFilters ?? []).map(saved => ({
                id: saved.name,
                name: saved.name,
                view: viewId,
                createdAt: '2026-01-01T00:00:00.000Z',
                formatRevision: '',
                state: saved.state as Json
            })),
            ...(view.definitionRevision === undefined ? {} : { definitionRevision: view.definitionRevision })
        }]))
    };
}

/* The project */

export type Loaded = {
    project: DefinitionsProject;
    /** The project's @kronor/dtv, as its app runs it. */
    dtv: typeof Dtv;
    /** The exports of a module of the project. */
    module(file: string): Record<string, unknown>;
};

export type Read = {
    userData: UserData;
    resets: ViewResets[];
    /** What the app writes back. */
    written: { views: Record<string, any> };
    /** What dtv logged. */
    logged: string[];
};

export type Scenario = {
    dir: string;
    write(file: string, text: string): Promise<void>;
    remove(file: string): Promise<void>;
    read(file: string): Promise<string>;
    exists(file: string): Promise<boolean>;
    load(): Promise<Loaded>;
    snapshot(options?: Partial<Pick<MigrateOptions, 'definition' | 'manual' | 'renamedFrom'>>): Promise<{ log: string[]; todos: number; problems: readonly string[] }>;
    check(definition?: string): Promise<CheckReport>;
    /** dtv's runtime reading `stored` with the project's views (and `views`, e.g. instances of factories). */
    readUserData(stored: Json, views?: (loaded: Loaded) => unknown[]): Promise<Read>;
    /** TypeScript's errors in the project's own files. */
    typeErrors(): string[];
    /** Removes the project's folder. */
    dispose(): Promise<void>;
};

export async function scenario(config: { factories?: DtvDefinitionsConfig['definitions']['factories'] } = {}): Promise<Scenario> {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-scenario-')));
    const tsconfig = {
        compilerOptions: {
            target: 'ES2020',
            lib: ['ES2020', 'DOM'],
            module: 'ESNext',
            moduleResolution: 'bundler',
            jsx: 'react-jsx',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
            paths: { '@kronor/dtv': [SHIM] }
        },
        include: ['**/*.ts']
    };
    await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 4));

    const definitionsConfig: DtvDefinitionsConfig = {
        scan: { include: ['**/*.ts'], exclude: [], dtvImport: '@kronor/dtv' },
        definitions: { factories: config.factories },
        root: dir
    };
    const options = (log: string[]): DefinitionsOptions => ({ cwd: dir, migrationsDir: 'dtv-migrations', dtvImport: '@kronor/dtv', log: line => log.push(line) });

    async function load(): Promise<Loaded> {
        // A fresh evaluation of the project's modules, as after a rebuild.
        jest.resetModules();
        const evaluate = (id: string) => jest.requireActual<Record<string, unknown>>(id === '@kronor/dtv' ? SHIM : id);
        const project = await buildProject({
            cwd: dir,
            config: definitionsConfig,
            loadModule: async id => evaluate(id),
            close: async () => undefined
        });
        return {
            project,
            dtv: evaluate('@kronor/dtv') as unknown as typeof Dtv,
            module: file => evaluate(path.join(dir, file))
        };
    }

    return {
        dir,
        write: async (file, text) => {
            await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
            await fs.writeFile(path.join(dir, file), text);
        },
        remove: async file => fs.rm(path.join(dir, file), { recursive: true, force: true }),
        read: file => fs.readFile(path.join(dir, file), 'utf8'),
        exists: file => fs.access(path.join(dir, file)).then(() => true, () => false),
        load,
        async snapshot(migrate = {}) {
            const { project } = await load();
            const log: string[] = [];
            const { todos, problems } = await runMigrate({ ...options(log), ...migrate }, project);
            return { log, todos, problems };
        },
        async check(definition) {
            const { project } = await load();
            return runCheck({ ...options([]), definition }, project);
        },
        async readUserData(stored, views = () => []) {
            const loaded = await load();
            const { dtv, project } = loaded;
            const instances = [
                ...Object.values(project.definitions).flatMap(definition => definition.instances),
                ...views(loaded)
            ] as unknown as Dtv.View[];
            const filterGroupsByViewId = Object.fromEntries(instances.map(view => [view.id, view.filterGroups]));

            const logged: string[] = [];
            const saved = { error: console.error, warn: console.warn };
            console.error = (...parts: unknown[]) => { logged.push(parts.map(String).join(' ')); };
            console.warn = (...parts: unknown[]) => { logged.push(parts.map(String).join(' ')); };
            try {
                const migrationsByViewId = Object.fromEntries(instances.flatMap(view => {
                    const context = dtv.viewMigrationContext(view);
                    return context === undefined ? [] : [[view.id, context]];
                }));
                const read = dtv.readUserData(stored, filterGroupsByViewId, migrationsByViewId);
                if (read.tag === 'failure') throw new Error(`reading user data failed: ${JSON.stringify(read.error)}`);
                const written = dtv.encodeUserData(read.value.userData, filterGroupsByViewId, {}, migrationsByViewId);
                return { userData: read.value.userData, resets: read.value.resets, written: JSON.parse(JSON.stringify(written)), logged };
            } finally {
                console.error = saved.error;
                console.warn = saved.warn;
            }
        },
        typeErrors() {
            const parsed = ts.parseJsonConfigFileContent(tsconfig, ts.sys, dir);
            const program = ts.createProgram(parsed.fileNames, parsed.options);
            return ts.getPreEmitDiagnostics(program)
                .filter(diagnostic => diagnostic.file !== undefined && diagnostic.file.fileName.startsWith(dir))
                .map(diagnostic => {
                    const file = diagnostic.file as ts.SourceFile;
                    const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
                    return `${path.relative(dir, file.fileName)}(${line + 1}): ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
                });
        },
        dispose: () => fs.rm(dir, { recursive: true, force: true })
    };
}

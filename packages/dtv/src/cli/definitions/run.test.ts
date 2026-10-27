/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCheck, runMigrate, type DefinitionsOptions } from './run';
import type { LoadedView, ViewMigrationChain, ViewProjection, DefinitionsProject } from './types';
import { projectDefinition } from './resolve';

// The project's @kronor/dtv, as `dtv definitions` would load it.
import { projectView } from '../../framework/view-projection';
import { checkMigration, viewMigrationChain } from '../../framework/view-migrations';
import type { View } from '../../framework/view';

const textFilter = (id: string, field = id) => ({
    id,
    label: id,
    aiGenerated: false,
    expression: { type: 'equals', field, value: { type: 'text' } }
});

const viewWith = (filters: ReturnType<typeof textFilter>[], migrations?: ViewMigrationChain): LoadedView => ({
    id: 'payments',
    title: 'Payments',
    source: { type: 'collection', collectionName: 'payments' },
    columnDefinitions: [],
    filterGroups: [{ name: 'default', label: null, filters }],
    boolExpType: 'BoolExp',
    orderByType: 'OrderBy',
    paginationKey: 'id',
    ...(migrations === undefined ? {} : { migrations })
}) as unknown as LoadedView;

const chainOf = (filters: ReturnType<typeof textFilter>[], definition = 'payments') =>
    viewMigrationChain(projectView(viewWith(filters) as unknown as View, definition, 1), []);

describe('dtv definitions', () => {
    let cwd: string;
    let log: string[];
    let options: DefinitionsOptions;

    beforeEach(async () => {
        cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-views-'));
        log = [];
        options = { cwd, migrationsDir: 'dtv-migrations', dtvImport: '@kronor/dtv', log: line => log.push(line) };
    });

    afterEach(async () => {
        await fs.rm(cwd, { recursive: true, force: true });
    });

    /**
     * A project whose migration folders are `chains` (relative path → chain), and whose views
     * are defined in `sources` (definition → relative source file).
     */
    async function projectWith(
        views: Record<string, LoadedView>,
        chains: Record<string, ViewMigrationChain> = {},
        sources: Record<string, string> = {}
    ): Promise<DefinitionsProject> {
        // Each index module names its chain, so a folder loads the same chain after it moved.
        for (const folder of Object.keys(chains)) {
            await fs.mkdir(path.join(cwd, folder), { recursive: true });
            await fs.writeFile(path.join(cwd, folder, 'index.ts'), folder);
        }
        const tooling: DefinitionsProject['tooling'] = {
            projectView: (view, definition, revision) => projectView(view as unknown as View, definition, revision) as ViewProjection,
            checkMigration: migration => checkMigration(migration as never)
        };
        const definitions = Object.fromEntries(Object.entries(views).map(([definition, view]) => [definition, {
            instances: [view],
            source: sources[definition] === undefined ? null : path.join(cwd, sources[definition])
        }]));
        return {
            definitions,
            problems: [],
            tooling,
            projectDefinition: (definition, revision) => projectDefinition(definitions[definition], definition, revision, tooling.projectView),
            findChainFolders: async () => {
                const found: string[] = [];
                const walk = async (dir: string): Promise<void> => {
                    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
                        if (!entry.isDirectory()) continue;
                        const full = path.join(dir, entry.name);
                        if (path.basename(dir) === 'dtv-migrations') found.push(full);
                        else await walk(full);
                    }
                };
                await walk(cwd);
                return found.sort();
            },
            loadChain: async folder => {
                const key = await fs.readFile(path.join(folder, 'index.ts'), 'utf8').catch(() => null);
                return key === null ? null : chains[key] ?? null;
            },
            close: async () => undefined
        };
    }

    const read = (file: string) => fs.readFile(path.join(cwd, file), 'utf8');

    it('puts the first snapshot next to the view, and wires the view up with it', async () => {
        const viewModule = "import { DSL } from '@kronor/dtv';\n\nexport const paymentsView = () => DSL.view({\n    id: 'payments',\n});\n";
        await fs.mkdir(path.join(cwd, 'src/pages/payments'), { recursive: true });
        await fs.writeFile(path.join(cwd, 'src/pages/payments/view.ts'), viewModule);

        await runMigrate(options, await projectWith(
            { payments: viewWith([textFilter('amt', 'amount')]) },
            {},
            { payments: 'src/pages/payments/view.ts' }
        ));

        expect(await read('src/pages/payments/dtv-migrations/payments/rev1.snapshot.ts')).toContain("definition: 'payments',\n    revision: 1,");
        expect(await read('src/pages/payments/dtv-migrations/payments/index.ts')).toContain('DSL.defineViewMigrations(rev1, []);');
        expect(await read('src/pages/payments/view.ts')).toBe(
            "import { DSL } from '@kronor/dtv';\nimport paymentsMigrations from './dtv-migrations/payments';\n\n" +
            "export const paymentsView = () => DSL.view({\n    id: 'payments',\n    migrations: paymentsMigrations,\n});\n"
        );
        expect(log).toEqual([
            'payments: first snapshot, revision 1, in src/pages/payments/dtv-migrations/payments',
            '  Wired it up in src/pages/payments/view.ts'
        ]);
    });

    it('puts the first snapshot of a view it cannot find the source of under the migrations dir', async () => {
        await runMigrate(options, await projectWith({ payments: viewWith([textFilter('status')]) }));

        expect(await read('dtv-migrations/payments/index.ts')).toContain('DSL.defineViewMigrations(rev1, []);');
        expect(log.slice(1)).toEqual([
            `  Wire it up in the view definition of "payments" (its module is not known, as for a JSON view; the path is from ${cwd}):`,
            "    import paymentsMigrations from './dtv-migrations/payments';",
            '    DSL.view({ …, migrations: paymentsMigrations })'
        ]);
    });

    it('writes the next revision into the folder the view imports, wherever it was moved', async () => {
        const chain = chainOf([textFilter('amt', 'amount'), textFilter('legacy')]);

        const { todos } = await runMigrate(options, await projectWith(
            { payments: viewWith([textFilter('amount')], chain) },
            // Moved away from its view, and next to it a stale copy nothing imports.
            { 'shared/dtv-migrations/payments': chain, 'src/dtv-migrations/payments': chainOf([textFilter('status')]) },
            { payments: 'src/view.ts' }
        ));

        expect(todos).toBe(0);
        const migration = await read('shared/dtv-migrations/payments/rev2.migration.ts');
        expect(migration).toContain("m.renameFilter('amt', 'amount'),");
        expect(migration).toContain("m.drop('legacy'),");
        expect(await read('shared/dtv-migrations/payments/index.ts')).toContain('DSL.defineViewMigrations(rev1, [m2]);');
        expect(log).toEqual(['payments: revision 2, 2 operation(s)']);
    });

    it('leaves an unchanged definition alone, unless a manual revision is asked for', async () => {
        const chain = chainOf([textFilter('status')]);
        const project = await projectWith({ payments: viewWith([textFilter('status')], chain) }, { 'dtv-migrations/payments': chain });

        await runMigrate(options, project);
        expect(log).toEqual(['1 view up to date']);

        log.length = 0;
        await runMigrate({ ...options, definition: 'payments' }, project);
        expect(log).toEqual(['payments: up to date at revision 1']);

        await runMigrate({ ...options, definition: 'payments', manual: 'status values are lower case now' }, project);
        expect(await read('dtv-migrations/payments/rev2.migration.ts')).toContain("m.todo('manual revision', 'status values are lower case now'),");
    });

    it('takes over the folder of a renamed definition, where it is', async () => {
        const chain = chainOf([textFilter('status')]);

        await runMigrate(
            { ...options, definition: 'payment-list', renamedFrom: 'payments' },
            await projectWith({ 'payment-list': viewWith([textFilter('status')], chain) }, { 'src/dtv-migrations/payments': chain })
        );

        expect(await fs.readdir(path.join(cwd, 'src/dtv-migrations'))).toEqual(['payment-list']);
        expect(await read('src/dtv-migrations/payment-list/rev2.snapshot.ts')).toContain("definition: 'payment-list',");
        expect(await read('src/dtv-migrations/payment-list/rev2.migration.ts')).toContain('DSL.defineMigration(rev1, rev2, () => []);');
        expect(log[0]).toBe('payment-list: took over src/dtv-migrations/payments, now src/dtv-migrations/payment-list');
    });

    it('checks that every view uses complete migrations of its own', async () => {
        const changed = chainOf([textFilter('status')], 'changed');
        const unused = chainOf([textFilter('status')], 'unwired');
        const borrowed = chainOf([textFilter('status')], 'other');

        const report = await runCheck(options, await projectWith({
            changed: viewWith([textFilter('status', 'state')], changed),
            unwired: viewWith([textFilter('status')]),
            unsnapshotted: viewWith([]),
            borrowing: viewWith([textFilter('status')], borrowed),
            stray: viewWith([textFilter('status')], chainOf([textFilter('status')], 'stray'))
        }, {
            'src/dtv-migrations/changed': changed,
            'src/dtv-migrations/unwired': unused,
            'src/dtv-migrations/other': borrowed,
            'src/dtv-migrations/orphan': chainOf([], 'orphan')
        }));

        expect(report.problems).toEqual([
            'changed: changed since revision 1; run `dtv definitions snapshot changed`',
            'unwired: the view does not use its migrations in src/dtv-migrations/unwired',
            'unsnapshotted: no snapshots; run `dtv definitions snapshot unsnapshotted`',
            'borrowing: the view uses the migrations of "other"',
            'stray: the view uses migrations that are not in a dtv-migrations/<definition> folder'
        ]);
        expect(report.warnings).toEqual([
            'src/dtv-migrations/orphan: migrations no view uses (renamed? `dtv definitions snapshot <new id> --renamed-from orphan`)'
        ]);
    });

    it('checks one definition when asked, leaving out the others and unused migrations', async () => {
        const changed = chainOf([textFilter('status')], 'changed');
        const project = await projectWith({
            changed: viewWith([textFilter('status', 'state')], changed),
            unsnapshotted: viewWith([])
        }, {
            'src/dtv-migrations/changed': changed,
            'src/dtv-migrations/orphan': chainOf([], 'orphan')
        });

        expect(await runCheck({ ...options, definition: 'changed' }, project)).toEqual({
            problems: ['changed: changed since revision 1; run `dtv definitions snapshot changed`'],
            warnings: []
        });
        expect(await runCheck({ ...options, definition: 'unsnapshotted' }, project)).toEqual({
            problems: ['unsnapshotted: no snapshots; run `dtv definitions snapshot unsnapshotted`'],
            warnings: []
        });
        await expect(runCheck({ ...options, definition: 'missing' }, project)).rejects.toThrow('No view definition "missing"');
    });

    it('passes views that use complete migrations of their own', async () => {
        const chain = chainOf([textFilter('status')]);
        const report = await runCheck(options, await projectWith(
            { payments: viewWith([textFilter('status')], chain) },
            { 'anywhere/dtv-migrations/payments': chain }
        ));

        expect(report).toEqual({ problems: [], warnings: [] });
    });
});

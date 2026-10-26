/**
 * @jest-environment node
 *
 * Scenarios end to end: user data over the life of a view — several revisions, data from a
 * newer or an unsnapshotted definition, instances with derived ids, renamed views, changes
 * the snapshots cannot see, columns, shared URLs.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { columns, filters, leaf, scenario, storedUserData, viewModule, withFilters, type FilterSource, type Scenario, type StoredView } from './harness';

jest.setTimeout(60_000);

const VIEW = 'payments/view.ts';
const MIGRATIONS = 'payments/dtv-migrations/payments';

describe('scenarios: user data over the life of a view', () => {
    let project: Scenario;

    afterEach(async () => {
        await project.dispose();
    });

    async function snapshotted(viewFilters: FilterSource[], viewColumns?: string[]): Promise<Scenario> {
        project = await scenario();
        await project.write(VIEW, viewModule({ id: 'payments', exportName: 'paymentsView', filters: viewFilters, columns: viewColumns }));
        await project.snapshot();
        return project;
    }

    async function changeFilters(...viewFilters: FilterSource[]) {
        await project.write(VIEW, withFilters(await project.read(VIEW), viewFilters));
    }

    async function decide(file: string, from: string, to: string) {
        const text = await project.read(file);
        if (!text.includes(from)) throw new Error(`${file} has no ${from}:\n${text}`);
        await project.write(file, text.replace(from, to));
    }

    const read = (views: Record<string, StoredView>) => project.readUserData(storedUserData(views));

    it('data from any older revision is migrated through every revision since', async () => {
        await snapshotted([filters.text('amt', 'amount'), filters.text('legacy')]);
        await changeFilters(filters.text('amount', 'amount'), filters.text('legacy'));
        await project.snapshot();
        await changeFilters(filters.text('amount', 'amount'));
        expect((await project.snapshot()).log).toEqual(['payments: revision 3, 1 operation(s)']);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const fromRevision1 = await read({ payments: { definitionRevision: 1, persistedFilterState: { amt: leaf('100'), legacy: leaf('x') } } });
        expect(fromRevision1.written.views.payments).toMatchObject({ definitionRevision: 3, persistedFilterState: { amount: leaf('100') } });

        const fromRevision2 = await read({ payments: { definitionRevision: 2, persistedFilterState: { amount: leaf('100'), legacy: leaf('x') } } });
        expect(fromRevision2.written.views.payments).toMatchObject({ definitionRevision: 3, persistedFilterState: { amount: leaf('100') } });
    });

    it('data from a newer revision than the app knows is left as it is', async () => {
        await snapshotted([filters.text('status')]);

        const stored = storedUserData({ payments: { definitionRevision: 5, persistedFilterState: { renamedLater: leaf('x') } } });
        const result = await project.readUserData(stored);
        expect(result.userData.views.payments).toBeUndefined();
        expect(result.written.views.payments).toEqual((stored as { views: Record<string, unknown> }).views.payments);
    });

    it('a definition changed without a snapshot: check fails; the app resets the changed filters and keeps the rest', async () => {
        await snapshotted([filters.text('status', 'status'), filters.text('note')]);
        await changeFilters(filters.text('status', 'state'), filters.text('note'));

        expect((await project.check()).problems).toEqual(['payments: changed since revision 1; run `dtv definitions snapshot payments`']);

        const result = await read({ payments: { definitionRevision: 1, persistedFilterState: { status: leaf('PAID'), note: leaf('x') } } });
        expect(result.logged).toEqual([expect.stringContaining('View "payments" differs from revision 1 of its definition "payments"')]);
        expect(result.resets).toEqual([{ viewId: 'payments', persistedFilterState: ['status'], savedFilters: [] }]);
        expect(result.written.views.payments.persistedFilterState).toEqual({ note: leaf('x') });
    });

    it('instances with ids derived from the definition share its migrations', async () => {
        project = await scenario();
        await project.write('assets/view.ts', viewModule({
            id: 'assets',
            exportName: 'assetsView',
            filters: [filters.text('amt', 'amount')],
            factory: { parameters: '(subsidiaryId?: number)', idExpression: "subsidiaryId === undefined ? 'assets' : `assets-${subsidiaryId}`" }
        }));
        expect((await project.snapshot()).log).toEqual([
            'assets: first snapshot, revision 1, in assets/dtv-migrations/assets',
            '  Wired it up in assets/view.ts'
        ]);
        await project.write('assets/view.ts', withFilters(await project.read('assets/view.ts'), [filters.text('amount', 'amount')]));
        expect((await project.snapshot()).log).toEqual(['assets: revision 2, 1 operation(s)']);

        const result = await project.readUserData(
            storedUserData({ 'assets-7': { definitionRevision: 1, persistedFilterState: { amt: leaf('100') } } }),
            loaded => [(loaded.module('assets/view.ts').assetsView as (subsidiaryId?: number) => unknown)(7)]
        );
        expect(result.written.views['assets-7']).toMatchObject({ definitionRevision: 2, persistedFilterState: { amount: leaf('100') } });
    });

    it('a view renamed: its migrations are taken over, its import follows, its users\' data moves to the new id', async () => {
        await snapshotted([filters.text('status')]);
        await decide(VIEW, "id: 'payments',", "id: 'payment-list',");

        const { log } = await project.snapshot({ definition: 'payment-list', renamedFrom: 'payments' });
        expect(log).toEqual([
            'payment-list: took over payments/dtv-migrations/payments, now payments/dtv-migrations/payment-list',
            '  Updated the import in payments/view.ts',
            'payment-list: revision 2, 0 operation(s)'
        ]);
        expect(await project.read(VIEW)).toContain("import paymentsMigrations from './dtv-migrations/payment-list';");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
        expect(project.typeErrors()).toEqual([]);

        const result = await read({ payments: { definitionRevision: 1, savedFilters: [{ name: 'Paid', state: { status: leaf('PAID') } }] } });
        expect(result.written.views.payments).toBeUndefined();
        expect(result.written.views['payment-list']).toMatchObject({ definitionRevision: 2, savedFilters: [{ name: 'Paid', state: { status: leaf('PAID') } }] });
    });

    it('enum values renamed, which snapshots cannot see: a manual revision rewrites them, and reports the dropped ones', async () => {
        await snapshotted([filters.multiselect('status', 'status', ['PAID', 'VOID', 'OPEN'])]);
        await changeFilters(filters.multiselect('status', 'status', ['paid', 'OPEN']));

        expect((await project.snapshot()).log).toEqual(['1 view up to date']);
        const { todos } = await project.snapshot({ definition: 'payments', manual: 'status values are lower case now' });
        expect(todos).toBe(1);
        await decide(`${MIGRATIONS}/rev2.migration.ts`, "m.todo('manual revision', 'status values are lower case now'),",
            "m.mapValues('status', value => value === 'PAID' ? 'paid' : value === 'VOID' ? DSL.DROP : value),");
        expect(project.typeErrors()).toEqual([]);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const result = await read({
            payments: {
                definitionRevision: 1,
                persistedFilterState: { status: leaf(['VOID']) },
                savedFilters: [{ name: 'Settled', state: { status: leaf(['PAID', 'OPEN']) } }]
            }
        });
        expect(result.written.views.payments.savedFilters[0].state).toEqual({ status: leaf(['paid', 'OPEN']) });
        expect(result.written.views.payments.persistedFilterState).toEqual({});
        expect(result.resets).toEqual([{ viewId: 'payments', persistedFilterState: ['status'], savedFilters: [] }]);
    });

    it('a column renamed: asked about; hidden columns follow the rename the user decides', async () => {
        await snapshotted([filters.text('status')], [columns.of('id'), columns.of('created', 'createdAt')]);
        await decide(VIEW, columns.of('created', 'createdAt'), columns.of('createdAt', 'createdAt'));

        expect((await project.snapshot()).todos).toBe(1);
        await decide(`${MIGRATIONS}/rev2.migration.ts`, "m.todo('created', 'renamed to \"createdAt\"?'),", "m.renameColumn('created', 'createdAt'),");
        expect(project.typeErrors()).toEqual([]);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const result = await read({ payments: { definitionRevision: 1, hiddenColumns: ['created', 'id'] } });
        expect(result.written.views.payments.hiddenColumns).toEqual(['createdAt', 'id']);
    });

    it('a column sorting by another field: its sort is reset, generated; a sort by another column stays', async () => {
        await snapshotted([filters.text('status')], [columns.of('id'), columns.of('amount')]);
        await decide(VIEW, columns.of('amount'), columns.of('amount', 'amountMinor'));

        expect((await project.snapshot()).todos).toBe(0);
        expect(await project.read(`${MIGRATIONS}/rev2.migration.ts`)).toContain("m.resetSort('amount')");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const byAmount = await read({ payments: { definitionRevision: 1, ordering: { field: 'amount', direction: 'DESC' } } });
        expect(byAmount.written.views.payments.ordering).toBeNull();

        const byId = await read({ payments: { definitionRevision: 1, ordering: { field: 'id', direction: 'DESC' } } });
        expect(byId.written.views.payments.ordering).toEqual({ field: 'id', direction: 'DESC' });
    });

    it('a filter state shared in a URL for an older revision is migrated too', async () => {
        await snapshotted([filters.text('amt', 'amount')]);
        await changeFilters(filters.text('amount', 'amount'));
        await project.snapshot();

        const { module, dtv } = await project.load();
        const view = module(VIEW).paymentsView as { migrations: Parameters<typeof dtv.migrateFilterState>[0] };
        expect(dtv.migrateFilterState(view.migrations, 1, { amt: leaf('100') } as never)).toEqual({ amount: leaf('100') });
    });
});

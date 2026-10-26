/**
 * @jest-environment node
 *
 * Scenarios end to end: a view's filters change, `dtv definitions snapshot` writes the
 * migration (or asks), the user decides where asked, `check` and TypeScript agree, and dtv's
 * runtime migrates user data stored before the change.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { both, emptyLeaf, filters, leaf, scenario, storedUserData, viewModule, withFilters, type FilterSource, type Scenario, type StoredView } from './harness';

jest.setTimeout(60_000);

const VIEW = 'payments/view.ts';
const V2 = 'payments/dtv-migrations/payments/v2.ts';

const decoded = (value: unknown) => ({ type: 'leaf', value: { type: 'value', value } });
const decodedEmpty = { type: 'leaf', value: { type: 'empty' } };

describe('scenarios: filters change', () => {
    let project: Scenario;

    afterEach(async () => {
        await project.dispose();
    });

    /** A project whose payments view, with `viewFilters`, is snapshotted and wired up. */
    async function snapshotted(...viewFilters: FilterSource[]): Promise<Scenario> {
        project = await scenario();
        await project.write(VIEW, viewModule({ id: 'payments', exportName: 'paymentsView', filters: viewFilters }));
        await project.snapshot();
        return project;
    }

    async function changeFilters(...viewFilters: FilterSource[]) {
        await project.write(VIEW, withFilters(await project.read(VIEW), viewFilters));
    }

    /** Replaces `from` in the migration to revision 2: a decision, as the user would write it. */
    async function decide(from: string, to: string) {
        const migration = await project.read(V2);
        if (!migration.includes(from)) throw new Error(`${V2} has no ${from}:\n${migration}`);
        await project.write(V2, migration.replace(from, to));
    }

    const read = (view: StoredView) => project.readUserData(storedUserData({ payments: { definitionRevision: 1, ...view } }));

    it('a filter added: an empty revision; current filters pick up its initial value, saved ones stay as saved', async () => {
        await snapshotted(filters.text('status'));
        await changeFilters(filters.text('status'), filters.text('merchant').replace("value: { type: 'text' }", "value: { type: 'text', initialValue: 'acme' }"));

        expect((await project.snapshot()).log).toEqual(['payments: revision 2, 0 operation(s)']);
        expect(await project.read(V2)).toContain('DSL.defineMigration(v1, v2, () => []);');
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
        expect(project.typeErrors()).toEqual([]);

        const result = await read({ persistedFilterState: { status: leaf('PAID') }, savedFilters: [{ name: 'Paid', state: { status: leaf('PAID') } }] });
        const view = result.userData.views.payments;
        expect(view.persistedFilterState?.get('merchant')).toEqual(decoded('acme'));
        expect(view.savedFilters[0].state.get('merchant')).toEqual(decodedEmpty);
        expect(result.written.views.payments.definitionRevision).toBe(2);
        expect(result.resets).toEqual([]);
    });

    it('a filter removed: dropped, from current and saved filters alike', async () => {
        await snapshotted(filters.text('status'), filters.text('legacy'));
        await changeFilters(filters.text('status'));

        expect((await project.snapshot()).log).toEqual(['payments: revision 2, 1 operation(s)']);
        expect(await project.read(V2)).toContain("    m.drop('legacy'),");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const result = await read({
            persistedFilterState: { status: leaf('PAID'), legacy: leaf('x') },
            savedFilters: [{ name: 'Old', state: { legacy: leaf('x') } }]
        });
        expect(result.written.views.payments.persistedFilterState).toEqual({ status: leaf('PAID') });
        expect(result.written.views.payments.savedFilters[0].state).toEqual({});
        expect(result.resets).toEqual([]);
    });

    it('a filter renamed: the rename is generated, and what is stored moves with it', async () => {
        await snapshotted(filters.text('amt', 'amount'));
        await changeFilters(filters.text('amount', 'amount'));

        const { log, todos } = await project.snapshot();
        expect(log).toEqual(['payments: revision 2, 1 operation(s)']);
        expect(todos).toBe(0);
        expect(await project.read(V2)).toContain("    m.renameFilter('amt', 'amount'),");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
        expect(project.typeErrors()).toEqual([]);

        const result = await read({ persistedFilterState: { amt: leaf('100') }, savedFilters: [{ name: 'Big', state: { amt: leaf('100') } }] });
        expect(result.userData.views.payments.persistedFilterState?.get('amount')).toEqual(decoded('100'));
        expect(result.userData.views.payments.savedFilters[0].state.get('amount')).toEqual(decoded('100'));
        expect(result.resets).toEqual([]);
    });

    it('two filters renamed at once: two renames', async () => {
        await snapshotted(filters.number('amt', 'amount'), filters.text('ref', 'reference'));
        await changeFilters(filters.number('amount', 'amount'), filters.text('reference', 'reference'));

        expect((await project.snapshot()).todos).toBe(0);
        const migration = await project.read(V2);
        expect(migration).toContain("    m.renameFilter('amt', 'amount'),");
        expect(migration).toContain("    m.renameFilter('ref', 'reference'),");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const result = await read({ persistedFilterState: { amt: leaf(100), ref: leaf('ABC') } });
        expect(result.written.views.payments.persistedFilterState).toEqual({ amount: leaf(100), reference: leaf('ABC') });
    });

    it('two filters renamed that look alike: both asked about, decided by the user, then migrated as decided', async () => {
        await snapshotted(filters.text('a', 'note'), filters.text('b', 'note'));
        await changeFilters(filters.text('c', 'note'), filters.text('d', 'note'));

        expect((await project.snapshot()).todos).toBe(2);
        const check = await project.check();
        expect(check.problems).toEqual(expect.arrayContaining([
            'payments: migration of "payments" to revision 2: undecided for "a": renamed to "c" or "d"?',
            'payments: migration of "payments" to revision 2: undecided for "b": renamed to "c" or "d"?'
        ]));
        expect(project.typeErrors().filter(error => error.includes('todo:'))).toHaveLength(2);

        await decide(`m.todo('a', 'renamed to "c" or "d"?'),`, "m.renameFilter('a', 'd'),");
        await decide(`m.todo('b', 'renamed to "c" or "d"?'),`, "m.renameFilter('b', 'c'),");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
        expect(project.typeErrors()).toEqual([]);

        const result = await read({ persistedFilterState: { a: leaf('x'), b: leaf('y') } });
        expect(result.written.views.payments.persistedFilterState).toEqual({ d: leaf('x'), c: leaf('y') });
    });

    it('a migration that does not reach the new definition: TypeScript and check say so; a correct one migrates', async () => {
        await snapshotted(filters.text('amt', 'amount'));
        await changeFilters(filters.text('amount', 'amountMinor'));

        expect((await project.snapshot()).todos).toBe(1);
        expect(await project.read(V2)).toContain(`m.todo('amt', 'renamed to "amount", and changed?'),`);

        // A plain rename does not cover the field change.
        await decide(`m.todo('amt', 'renamed to "amount", and changed?'),`, "m.renameFilter('amt', 'amount'),");
        expect(project.typeErrors()).toEqual([expect.stringContaining('renameFilter: \\"amt\\" and \\"amount\\" differ; use custom()')]);
        expect((await project.check()).problems).toEqual(['payments: migration of "payments" to revision 2: filter "amount" changed; keep, reset or migrate it']);

        // Neither does doing nothing.
        await decide("m.renameFilter('amt', 'amount'),", '');
        expect((await project.check()).problems).toEqual(['payments: migration of "payments" to revision 2: filter "amt" was removed; drop, rename or migrate it']);

        await decide("m => [\n", "m => [\n    m.custom('amt', 'amount', state => state),\n");
        expect(project.typeErrors()).toEqual([]);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const result = await read({ persistedFilterState: { amt: leaf('100') } });
        expect(result.written.views.payments.persistedFilterState).toEqual({ amount: leaf('100') });
        expect(result.resets).toEqual([]);
    });

    it('a text filter replaced by a custom operator: reset and reported, or converted by the user', async () => {
        await snapshotted(filters.text('reference'));
        await changeFilters(filters.customOperator('reference', 'reference', ['contains', 'equals']));

        expect((await project.snapshot()).todos).toBe(0);
        expect(await project.read(V2)).toContain("    m.reset('reference'),");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const stored = { persistedFilterState: { reference: leaf('ABC') }, savedFilters: [{ name: 'Ref', state: { reference: leaf('ABC') } }] };
        const reset = await read(stored);
        expect(reset.resets).toEqual([{ viewId: 'payments', persistedFilterState: ['reference'], savedFilters: [{ name: 'Ref', filterIds: ['reference'] }] }]);
        expect(reset.userData.views.payments.persistedFilterState?.get('reference')).toEqual(decoded({ operator: 'contains', value: { type: 'empty' } }));

        await decide("m.reset('reference'),", [
            "m.custom('reference', 'reference', state => state.value.type === 'value'",
            "        ? { type: 'leaf', value: { type: 'value', value: { operator: 'equals', value: { type: 'value', value: state.value.value } } } }",
            '        : DSL.RESET),'
        ].join('\n'));
        expect(project.typeErrors()).toEqual([]);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const converted = await read(stored);
        expect(converted.resets).toEqual([]);
        expect(converted.userData.views.payments.persistedFilterState?.get('reference')).toEqual(decoded({ operator: 'equals', value: { type: 'value', value: 'ABC' } }));
        expect(converted.userData.views.payments.savedFilters[0].state.get('reference')).toEqual(decoded({ operator: 'equals', value: { type: 'value', value: 'ABC' } }));
    });

    it('a filter on another field: asked about; kept as the user decides', async () => {
        await snapshotted(filters.text('status', 'status'));
        await changeFilters(filters.text('status', 'state'));

        expect((await project.snapshot()).todos).toBe(1);
        expect(await project.read(V2)).toContain("m.todo('status', 'its field changed from \"status\" to \"state\"; does what is stored still mean the same?'),");

        await decide("m.todo('status', 'its field changed from \"status\" to \"state\"; does what is stored still mean the same?'),",
            "m.keep('status', { because: 'the GraphQL field was renamed' }),");
        expect(project.typeErrors()).toEqual([]);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const result = await read({ persistedFilterState: { status: leaf('PAID') } });
        expect(result.written.views.payments.persistedFilterState).toEqual({ status: leaf('PAID') });
        expect(result.resets).toEqual([]);
    });

    it('operators removed: mapped to remaining ones as the user decides, silently; mapped to nothing, reported', async () => {
        await snapshotted(filters.customOperator('reference', 'reference', ['contains', 'equals', 'startsWith']));
        await changeFilters(filters.customOperator('reference', 'reference', ['contains', 'equals']));

        expect((await project.snapshot()).todos).toBe(1);
        const asked = "m.todo('reference', 'map the operators it no longer offers: startsWith'),";
        expect(await project.read(V2)).toContain(asked);

        const stored = { persistedFilterState: { reference: leaf({ operator: 'startsWith', value: { type: 'value', value: 'AB' } }) } };

        await decide(asked, "m.mapOperators('reference', { startsWith: 'contains' }),");
        expect(project.typeErrors()).toEqual([]);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
        const mapped = await read(stored);
        expect(mapped.userData.views.payments.persistedFilterState?.get('reference')).toEqual(decoded({ operator: 'contains', value: { type: 'value', value: 'AB' } }));
        expect(mapped.resets).toEqual([]);

        await decide("m.mapOperators('reference', { startsWith: 'contains' }),", "m.mapOperators('reference', { startsWith: null }),");
        const cleared = await read(stored);
        expect(cleared.resets).toEqual([{ viewId: 'payments', persistedFilterState: ['reference'], savedFilters: [] }]);
    });

    it('operators added: nothing to decide', async () => {
        await snapshotted(filters.customOperator('reference', 'reference', ['contains']));
        await changeFilters(filters.customOperator('reference', 'reference', ['contains', 'equals']));

        expect((await project.snapshot()).todos).toBe(0);
        expect(await project.read(V2)).toContain("    m.mapOperators('reference', {}),");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });

        const stored = leaf({ operator: 'contains', value: { type: 'value', value: 'AB' } });
        const result = await read({ persistedFilterState: { reference: stored } });
        expect(result.written.views.payments.persistedFilterState).toEqual({ reference: stored });
    });

    it('a date range gaining a bound: its stored state no longer fits; reset and reported', async () => {
        await snapshotted(filters.dateRange('created', 'createdAt'));
        await changeFilters(filters.dateRange('created', 'createdAt').replace(
            "{ type: 'lessThanOrEqual', field: 'createdAt', value: { type: 'date' } }]",
            "{ type: 'lessThanOrEqual', field: 'createdAt', value: { type: 'date' } }, { type: 'notEquals', field: 'createdAt', value: { type: 'date' } }]"
        ));

        expect((await project.snapshot()).todos).toBe(0);
        const migration = await project.read(V2);
        expect(migration).toContain('// Stored state of "created" no longer fits: it has 3 parts instead of 2.');
        expect(migration).toContain("    m.reset('created'),");

        const result = await read({ savedFilters: [{ name: 'January', state: { created: both(leaf('2026-01-01T00:00:00.000Z'), emptyLeaf) } }] });
        expect(result.resets).toEqual([{ viewId: 'payments', persistedFilterState: [], savedFilters: [{ name: 'January', filterIds: ['created'] }] }]);
        expect(result.written.views.payments.savedFilters[0].state).toEqual({});
    });
});

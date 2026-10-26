/**
 * @jest-environment node
 *
 * Scenarios end to end: `dtv definitions snapshot` and `check` on a project, then dtv's
 * runtime reading user data stored before the change. The basics: views coming and going.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { filters, leaf, scenario, storedUserData, viewModule, type Scenario } from './harness';

jest.setTimeout(60_000);

const payments = (...viewFilters: string[]) => viewModule({ id: 'payments', exportName: 'paymentsView', filters: viewFilters });
const orders = (...viewFilters: string[]) => viewModule({ id: 'orders', exportName: 'ordersView', filters: viewFilters });
const decoded = (value: unknown) => ({ type: 'leaf', value: { type: 'value', value } });

describe('scenarios: views coming and going', () => {
    let project: Scenario;

    afterEach(async () => {
        await project.dispose();
    });

    it('a new view: first snapshot, wired up, checked; data stored before reads as revision 1', async () => {
        project = await scenario();
        await project.write('payments/view.ts', payments(filters.text('status')));

        const { log, todos } = await project.snapshot();
        expect(log).toEqual([
            'payments: first snapshot, revision 1, in payments/dtv-migrations/payments',
            '  Wired it up in payments/view.ts'
        ]);
        expect(todos).toBe(0);
        expect(await project.read('payments/view.ts')).toContain("import paymentsMigrations from './dtv-migrations/payments';");
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
        expect(project.typeErrors()).toEqual([]);

        const read = await project.readUserData(storedUserData({ payments: { persistedFilterState: { status: leaf('PAID') } } }));
        expect(read.userData.views.payments.persistedFilterState?.get('status')).toEqual(decoded('PAID'));
        expect(read.written.views.payments.definitionRevision).toBe(1);
        expect(read.resets).toEqual([]);
    });

    it('a view not snapshotted yet fails the check', async () => {
        project = await scenario();
        await project.write('payments/view.ts', payments(filters.text('status')));

        expect(await project.check()).toEqual({ problems: ['payments: no snapshots; run `dtv definitions snapshot payments`'], warnings: [] });
    });

    it('labels and initial values are not the definition: no revision for them', async () => {
        project = await scenario();
        await project.write('payments/view.ts', payments(filters.text('status')));
        await project.snapshot();

        const relabelled = (await project.read('payments/view.ts'))
            .replace("label: 'status'", "label: 'Payment status'")
            .replace("value: { type: 'text' }", "value: { type: 'text', initialValue: 'PAID' }");
        await project.write('payments/view.ts', relabelled);

        expect((await project.snapshot()).log).toEqual(['1 view up to date']);
        expect(await project.exists('payments/dtv-migrations/payments/v2.ts')).toBe(false);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
    });

    it('of several views, only the changed one gets a revision; the others are counted', async () => {
        project = await scenario();
        await project.write('payments/view.ts', payments(filters.text('status')));
        await project.write('orders/view.ts', orders(filters.text('state')));
        await project.snapshot();

        await project.write('orders/view.ts', (await project.read('orders/view.ts')).replace("filters: [", `filters: [\n        ${filters.text('note')},`));

        expect((await project.snapshot()).log).toEqual(['orders: revision 2, 0 operation(s)', '1 view up to date']);
        expect(await project.check()).toEqual({ problems: [], warnings: [] });
    });

    it('a removed view: its migrations are left, warned about; its stored data is kept as it is', async () => {
        project = await scenario();
        await project.write('payments/view.ts', payments(filters.text('status')));
        await project.snapshot();
        await project.remove('payments/view.ts');

        expect((await project.snapshot()).log).toEqual([]);
        expect(await project.check()).toEqual({
            problems: [],
            warnings: ['payments/dtv-migrations/payments: migrations no view uses (renamed? `dtv definitions snapshot <new id> --renamed-from payments`)']
        });

        const stored = storedUserData({ payments: { definitionRevision: 1, savedFilters: [{ name: 'Paid', state: { status: leaf('PAID') } }] } });
        const read = await project.readUserData(stored);
        expect(read.userData.views.payments).toBeUndefined();
        expect(read.written.views.payments).toEqual((stored as { views: Record<string, unknown> }).views.payments);
    });

    it('a module building a view that no export gives is reported, and left alone', async () => {
        project = await scenario();
        await project.write('payments/view.ts', payments(filters.text('status')));
        // A view built and used inside a component: nothing the CLI could import builds it.
        const inline = viewModule({ id: 'inline', exportName: 'inlineView', filters: [filters.text('status')] })
            .replace('export const inlineView: View = DSL.view(', 'export function render(): string {\n    const view: View = DSL.view(')
            .replace(/\);\n$/, ');\n    return view.title;\n}\n');
        await project.write('inline/component.ts', inline);

        const { log, problems } = await project.snapshot();
        expect(log[0]).toBe('payments: first snapshot, revision 1, in payments/dtv-migrations/payments');
        expect(problems).toEqual(['inline/component.ts: calls DSL.view, but none of its exports is a view or returns one, so dtv definitions cannot build it']);
    });
});

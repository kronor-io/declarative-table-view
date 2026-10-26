import { describe, expect, it, jest } from '@jest/globals';
import { defineMigration, defineViewMigrations, DROP, RESET } from '../dsl/migrations';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import { decodeFilterState } from './filter-form-state';
import type { FilterControl as FilterControlType, FilterExpr as FilterExprType, FilterGroups } from './filters';
import { defaultUndecodedViewData, type UndecodedFilterFormState, type UndecodedFilterState, type UndecodedViewData } from './user-data-undecoded';
import {
    applySchema,
    applyToViewData,
    checkMigration,
    migrateFilterState,
    migrateViewData,
    previousDefinitions,
    resetFiltersChangedSinceSnapshot,
    type ViewMigration
} from './view-migrations';
import { projectFilter, projectView, type ControlProjection, type FilterProjection, type ViewProjection } from './view-projection';
import type { View } from './view';

const leaf = (value: unknown): UndecodedFilterFormState => ({ type: 'leaf', value: { type: 'value', value: value as never } });
const empty: UndecodedFilterFormState = { type: 'leaf', value: { type: 'empty' } };

const v1 = {
    definition: 'payments',
    revision: 1,
    filters: {
        amt: { kind: 'leaf', cmp: 'equals', field: 'amount', control: { type: 'number' } },
        status: { kind: 'leaf', cmp: 'in', field: 'status', control: { type: 'multiselect' } },
        reference: {
            kind: 'leaf',
            cmp: 'equals',
            field: 'reference',
            control: { type: 'customOperator', operators: ['_eq', '_like', '_nlike'], valueControl: { type: 'text' } }
        },
        created: {
            kind: 'and',
            children: [
                { kind: 'leaf', cmp: 'greaterThanOrEqual', field: 'createdAt', control: { type: 'date' } },
                { kind: 'leaf', cmp: 'lessThanOrEqual', field: 'createdAt', control: { type: 'date' } }
            ]
        },
        legacy: { kind: 'leaf', cmp: 'equals', field: 'legacy', control: { type: 'text' } }
    },
    columns: { id: { orderBy: 'id' }, old: { orderBy: null }, amount: { orderBy: 'amount' } }
} as const satisfies ViewProjection;

const v2 = {
    definition: 'payments',
    revision: 2,
    filters: {
        amount: v1.filters.amt,
        status: v1.filters.status,
        reference: {
            kind: 'leaf',
            cmp: 'equals',
            field: 'reference',
            control: { type: 'customOperator', operators: ['_eq', '_ilike'], valueControl: { type: 'text' } }
        },
        created: {
            kind: 'and',
            children: [
                { kind: 'leaf', cmp: 'greaterThanOrEqual', field: 'created_at', control: { type: 'date' } },
                { kind: 'leaf', cmp: 'lessThanOrEqual', field: 'created_at', control: { type: 'date' } }
            ]
        },
        merchant: { kind: 'leaf', cmp: 'equals', field: 'merchant', control: { type: 'text' } }
    },
    columns: { id: { orderBy: 'id' }, renamed: { orderBy: null }, amount: { orderBy: 'amountMinor' } }
} as const satisfies ViewProjection;

const complete = defineMigration(v1, v2, m => [
    m.renameFilter('amt', 'amount'),
    m.mapOperators('reference', { _like: '_ilike', _nlike: null }),
    m.keep('created', { because: 'the GraphQL field was renamed' }),
    m.mapValues('status', value => value === 'PAID' ? 'paid' : value === 'VOID' ? DROP : value),
    m.drop('legacy'),
    m.renameColumn('old', 'renamed'),
    m.resetSort('amount')
]);

const stored = (fields: Partial<UndecodedViewData>): UndecodedViewData => ({ ...defaultUndecodedViewData(), ...fields });

describe('view projections', () => {
    it('keep what stored user data depends on, and leave out labels, initial values and items', () => {
        const view = {
            id: 'payments-credit',
            filterGroups: [{
                name: 'default',
                label: null,
                filters: [{
                    id: 'status',
                    label: 'Status',
                    aiGenerated: false,
                    expression: FilterExpr.in({ field: 'status', control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'PAID' }], initialValue: ['PAID'] }) })
                }]
            }],
            columnDefinitions: [
                { type: 'tableColumn', id: 'id', name: 'ID', data: [{ type: 'valueQuery', field: 'id' }], cellRenderer: () => null },
                { type: 'virtualColumn', id: 'hidden', data: [{ type: 'valueQuery', field: 'x' }] }
            ]
        } as unknown as View;

        expect(projectView(view, 'payments', 3)).toEqual({
            definition: 'payments',
            revision: 3,
            filters: { status: { kind: 'leaf', cmp: 'in', field: 'status', control: { type: 'multiselect' } } },
            columns: { id: { orderBy: 'id' } }
        });
    });
});

describe('checkMigration', () => {
    it('finds nothing uncovered when the operations take the older snapshot to the newer one', () => {
        expect(checkMigration(complete)).toEqual([]);
    });

    it('reports every change no operation covers, and undecided todos', () => {
        const partial: ViewMigration = { from: v1, to: v2, ops: [{ kind: 'todo', subject: 'amt', message: 'rename?' }] };

        expect(checkMigration(partial).map(problem => problem.message)).toEqual([
            'migration of "payments" to revision 2: undecided for "amt": rename?',
            'migration of "payments" to revision 2: filter "amt" was removed; drop, rename or migrate it',
            'migration of "payments" to revision 2: filter "reference" changed; keep, reset or migrate it',
            'migration of "payments" to revision 2: filter "created" changed; keep, reset or migrate it',
            'migration of "payments" to revision 2: filter "legacy" was removed; drop, rename or migrate it',
            'migration of "payments" to revision 2: column "old" was removed; drop or rename it',
            'migration of "payments" to revision 2: column "amount" sorts differently; reset its sort'
        ]);
    });
});

describe('applying a migration to stored view data', () => {
    it('renames, maps and drops what is stored, in persisted state and saved filters alike', () => {
        const state: UndecodedFilterState = {
            amt: leaf(5),
            status: { type: 'leaf', value: { type: 'value', value: ['PAID', 'VOID', 'OPEN'] } },
            reference: leaf({ operator: '_like', value: { type: 'value', value: 'ABC%' } }),
            legacy: leaf('x')
        };
        const migrated = applyToViewData(complete, stored({
            hiddenColumns: ['old', 'id'],
            columnOrder: ['amount', 'old'],
            persistedFilterState: state,
            savedFilters: [{ id: 'sf', name: 'Saved', view: 'payments', createdAt: '2026-01-01T00:00:00.000Z', formatRevision: '', state }]
        }));

        const expectedState = {
            amount: leaf(5),
            // A list (a multiselect's value) is mapped element by element.
            status: { type: 'leaf', value: { type: 'value', value: ['paid', 'OPEN'] } },
            reference: leaf({ operator: '_ilike', value: { type: 'value', value: 'ABC%' } })
        };
        expect(migrated.data.persistedFilterState).toEqual(expectedState);
        expect(migrated.data.savedFilters[0].state).toEqual(expectedState);
        expect(migrated.data.hiddenColumns).toEqual(['renamed', 'id']);
        expect(migrated.data.columnOrder).toEqual(['amount', 'renamed']);
        expect(migrated.data.definitionRevision).toBe(2);
        // 'VOID' was mapped away: users are told, as for a reset.
        expect(migrated.resets).toEqual({ persistedFilterState: ['status'], savedFilters: [{ name: 'Saved', filterIds: ['status'] }] });
    });

    it('clears values a mapping drops, and operators mapped to nothing', () => {
        const migration = defineMigration(v1, v2, m => [
            m.mapValues('status', value => value === 'VOID' ? DROP : value),
            m.mapOperators('reference', { _like: '_ilike', _nlike: null })
        ]);
        const migrated = applyToViewData(migration, stored({
            persistedFilterState: { status: leaf(['VOID']), reference: leaf({ operator: '_nlike', value: { type: 'value', value: 'x' } }) }
        }));

        expect(migrated.data.persistedFilterState).toEqual({ status: empty, reference: empty });
        expect(migrated.resets.persistedFilterState).toEqual(['status', 'reference']);
    });

    it('does not report values a mapping only rewrites', () => {
        const migration = defineMigration(v1, v2, m => [
            m.mapValues('status', value => value === 'PAID' ? 'paid' : value),
            m.mapOperators('reference', { _like: '_ilike', _nlike: null })
        ]);
        const migrated = applyToViewData(migration, stored({
            persistedFilterState: { status: leaf(['PAID', 'OPEN']), reference: leaf({ operator: '_like', value: { type: 'value', value: 'x' } }) }
        }));

        expect(migrated.data.persistedFilterState).toEqual({
            status: leaf(['paid', 'OPEN']),
            reference: leaf({ operator: '_ilike', value: { type: 'value', value: 'x' } })
        });
        expect(migrated.resets).toEqual({ persistedFilterState: [], savedFilters: [] });
    });

    it('reports filters it resets, by where they were stored', () => {
        const migration = defineMigration(v1, v2, m => [
            m.reset('created'),
            m.custom('amt', 'amount', state => state.value.type === 'value' && typeof state.value.value === 'number' && state.value.value > 0 ? state : RESET)
        ]);
        const migrated = applyToViewData(migration, stored({
            persistedFilterState: { created: { type: 'and', children: [empty, empty] }, amt: leaf(-1) },
            savedFilters: [{ id: 'sf', name: 'Positive', view: 'payments', createdAt: '2026-01-01T00:00:00.000Z', formatRevision: '', state: { amt: leaf(3) } }]
        }));

        expect(migrated.data.persistedFilterState).toEqual({});
        expect(migrated.data.savedFilters[0].state).toEqual({ amount: leaf(3) });
        expect(migrated.resets).toEqual({ persistedFilterState: ['created', 'amount'], savedFilters: [] });
    });

    it('resets a filter whose custom migration throws', () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const migration = defineMigration(v1, v2, m => [m.custom('amt', 'amount', () => { throw new Error('boom'); })]);

        const migrated = applyToViewData(migration, stored({ persistedFilterState: { amt: leaf(1) } }));

        expect(migrated.data.persistedFilterState).toEqual({});
        expect(migrated.resets.persistedFilterState).toEqual(['amount']);
        error.mockRestore();
    });
});

describe('migration chains', () => {
    const v3 = { ...v2, revision: 3, definition: 'payment-list', filters: { ...v2.filters, merchant: { ...v2.filters.merchant, field: 'merchantId' } } } as const;
    const chain = defineViewMigrations(v1, [complete, defineMigration(v2, v3, m => [m.reset('merchant')])]);

    it('migrates stored data from the revision it was written for', () => {
        const fromRevision1 = migrateViewData(chain, stored({ persistedFilterState: { amt: leaf(1), merchant: leaf('m') } }));
        expect(fromRevision1.data.persistedFilterState).toEqual({ amount: leaf(1) });
        expect(fromRevision1.data.definitionRevision).toBe(3);

        const fromRevision2 = migrateViewData(chain, stored({ definitionRevision: 2, persistedFilterState: { amt: leaf(1), merchant: leaf('m') } }));
        expect(fromRevision2.data.persistedFilterState).toEqual({ amt: leaf(1) });
        expect(fromRevision2.resets.persistedFilterState).toEqual(['merchant']);

        const current = stored({ definitionRevision: 3, persistedFilterState: { merchant: leaf('m') } });
        expect(migrateViewData(chain, current).data).toBe(current);
    });

    it('migrates a single filter state, e.g. a shared one', () => {
        expect(migrateFilterState(chain, 1, { amt: leaf(2) })).toEqual({ amount: leaf(2) });
    });

    it('knows the ids older snapshots had', () => {
        expect(previousDefinitions(chain)).toEqual(['payments']);
    });
});

describe('filters changed since the latest snapshot', () => {
    it('lose their stored state; unchanged and added filters keep theirs', () => {
        const live: ViewProjection = { ...v2, filters: { ...v2.filters, amount: { ...v2.filters.amount, cmp: 'greaterThan' }, extra: v2.filters.merchant } };
        const result = resetFiltersChangedSinceSnapshot(v2, live, stored({
            persistedFilterState: { amount: leaf(1), status: leaf(['x']) },
            savedFilters: [{ id: 'sf', name: 'Saved', view: 'payments', createdAt: '2026-01-01T00:00:00.000Z', formatRevision: '', state: { amount: leaf(2) } }]
        }));

        expect(result.data.persistedFilterState).toEqual({ status: leaf(['x']) });
        expect(result.data.savedFilters[0].state).toEqual({});
        expect(result.resets).toEqual({ persistedFilterState: ['amount'], savedFilters: [{ name: 'Saved', filterIds: ['amount'] }] });
    });
});

/* Property: state that fits the older snapshot, migrated, fits what the schema side makes of the snapshot */

function controlOf(projection: ControlProjection): FilterControlType {
    switch (projection.type) {
        case 'customOperator':
            return {
                type: 'customOperator',
                operators: projection.operators.map(value => ({ label: value, value })),
                valueControl: controlOf(projection.valueControl)
            };
        case 'dropdown':
        case 'multiselect':
            return { type: projection.type, items: [] };
        case 'text':
        case 'number':
        case 'date':
            return { type: projection.type };
        default:
            throw new Error(`no control for ${projection.type} in this test`);
    }
}

function expressionOf(projection: FilterProjection): FilterExprType {
    switch (projection.kind) {
        case 'leaf':
            return { type: projection.cmp, field: projection.field as string, value: controlOf(projection.control) } as FilterExprType;
        case 'not':
            return { type: 'not', filter: expressionOf(projection.child) };
        case 'and':
        case 'or':
            return { type: projection.kind, filters: projection.children.map(expressionOf) };
    }
}

function filterGroupsOf(projection: ViewProjection): FilterGroups {
    return [{
        name: 'default',
        label: null,
        filters: Object.entries(projection.filters).map(([id, filter]) => ({ id, label: id, aiGenerated: false, expression: expressionOf(filter) }))
    }];
}

/** States that fit a filter: each leaf empty, with a value, or (for custom operators) with each operator. */
function statesOf(projection: FilterProjection): UndecodedFilterFormState[] {
    switch (projection.kind) {
        case 'leaf': {
            const control = projection.control;
            const values = control.type === 'customOperator'
                ? control.operators.map(operator => leaf({ operator, value: { type: 'value', value: 'v' } }))
                : control.type === 'date' ? [leaf('2026-01-01T00:00:00.000Z')] : [leaf(control.type === 'number' ? 1 : 'v')];
            return [empty, ...values];
        }
        case 'not':
            return statesOf(projection.child).map(child => ({ type: 'not', child }));
        case 'and':
        case 'or': {
            const childStates = projection.children.map(statesOf);
            const longest = Math.max(...childStates.map(states => states.length));
            return Array.from({ length: longest }, (_, index) => ({
                type: projection.kind,
                children: childStates.map(states => states[index % states.length])
            }));
        }
    }
}

describe('the schema and state sides of every operation agree', () => {
    it('for a migration with one of each', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const expected = complete.ops.reduce((projection, op) => applySchema(op, projection, complete.to), complete.from);
        const groups = filterGroupsOf(expected);

        for (const [filterId, filter] of Object.entries(complete.from.filters)) {
            for (const state of statesOf(filter)) {
                const migrated = applyToViewData(complete, stored({ persistedFilterState: { [filterId]: state } }));
                const decoded = decodeFilterState(migrated.data.persistedFilterState ?? {}, groups);
                expect({ filterId, state, reset: decoded.resetFilterIds }).toEqual({ filterId, state, reset: [] });
            }
        }
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('projectFilter and expressionOf are inverses for the snapshots above', () => {
        for (const filter of Object.values(v1.filters)) {
            expect(projectFilter(expressionOf(filter))).toEqual(filter);
        }
    });
});

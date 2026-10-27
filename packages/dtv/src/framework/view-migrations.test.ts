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
    type MigrationOp,
    type ViewMigration
} from './view-migrations';
import { itemValues, projectFilter, projectView, type ControlProjection, type FilterProjection, type ViewProjection } from './view-projection';
import type { View } from './view';

const leaf = (value: unknown): UndecodedFilterFormState => ({ type: 'leaf', value: { type: 'value', value: value as never } });
const empty: UndecodedFilterFormState = { type: 'leaf', value: { type: 'empty' } };

const rev1 = {
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

const rev2 = {
    definition: 'payments',
    revision: 2,
    filters: {
        amount: rev1.filters.amt,
        status: rev1.filters.status,
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

const complete = defineMigration(rev1, rev2, m => [
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
    it('keep what stored user data depends on, item values apart, and leave out labels and initial values', () => {
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
            columns: { id: { orderBy: 'id' } },
            items: { status: ['PAID'] }
        });
    });

    it('take item values from every dropdown and multiselect of a filter, but not from inside custom operators', () => {
        const yesNo = FilterControl.dropdown({ items: [{ label: 'Yes', value: true }, { label: 'No', value: false }] });
        expect(itemValues(FilterExpr.or({ filters: [
            FilterExpr.equals({ field: 'voided', control: yesNo }),
            FilterExpr.equals({ field: 'confirmed', control: FilterControl.dropdown({ items: [{ label: 'Yes', value: true }, { label: 'Maybe', value: null }] }) })
        ] }))).toEqual([true, false, null]);

        expect(itemValues(FilterExpr.equals({ field: 'reference', control: FilterControl.customOperator({ operators: [{ label: 'is', value: '_eq' }], valueControl: yesNo }) }))).toBeNull();
        expect(itemValues(FilterExpr.equals({ field: 'at', control: FilterControl.dropdown({ items: [{ label: 'Now', value: new Date(0) }] }) }))).toBeNull();
        expect(itemValues(FilterExpr.equals({ field: 'name', control: FilterControl.text() }))).toBeNull();
        // As built of made-up arguments
        expect(itemValues({ type: 'equals', field: 'status', value: { type: 'dropdown', items: [undefined] as never } })).toBeNull();
    });
});

describe('checkMigration', () => {
    it('finds nothing uncovered when the operations take the older snapshot to the newer one', () => {
        expect(checkMigration(complete)).toEqual([]);
    });

    it('reports every change no operation covers, and undecided todos', () => {
        const partial: ViewMigration = { from: rev1, to: rev2, ops: [{ kind: 'todo', subject: 'amt', message: 'rename?' }] };

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

describe('item values', () => {
    const journal = (revision: number, items?: unknown[], filterId = 'voided'): ViewProjection => ({
        definition: 'journal',
        revision,
        filters: { [filterId]: { kind: 'leaf', cmp: 'equals', field: 'voided', control: { type: 'dropdown' } } },
        columns: {},
        ...(items === undefined ? {} : { items: { [filterId]: items as never } })
    });
    const mapVoided = (map: (value: never) => unknown) => ({ kind: 'mapValues', filterId: 'voided', map }) as MigrationOp;
    const messages = (migration: ViewMigration) => checkMigration(migration).map(problem => problem.message);

    it('are a problem when gone from a filter\'s items, until mapped to the remaining ones', () => {
        const from = journal(1, [true, false]);
        const to = journal(2, [1, 0]);

        expect(messages({ from, to, ops: [] })).toEqual([
            'migration of "journal" to revision 2: filter "voided" no longer has the items true, false; map them with mapValues, or reset it'
        ]);
        expect(messages({ from, to, ops: [mapVoided(value => value === true ? 1 : 0)] })).toEqual([]);
        expect(messages({ from, to, ops: [{ kind: 'reset', filterId: 'voided' }] })).toEqual([]);
    });

    it('are mapped to the remaining ones, or dropped, without failing', () => {
        const from = journal(1, [true, false]);
        const to = journal(2, [1, 0]);

        expect(messages({ from, to, ops: [mapVoided(value => value === true ? 1 : DROP)] })).toEqual([]);
        expect(messages({ from, to, ops: [mapVoided(value => value === true ? 1 : 2)] })).toEqual([
            'migration of "journal" to revision 2: mapValues of "voided" maps false to 2, which is not among its items (1, 0)'
        ]);
        expect(messages({ from, to, ops: [mapVoided(() => { throw new Error('nope'); })] })).toEqual([
            'migration of "journal" to revision 2: mapValues of "voided" fails for true: nope',
            'migration of "journal" to revision 2: mapValues of "voided" fails for false: nope'
        ]);
    });

    it('are compared only where both snapshots have them', () => {
        expect(messages({ from: journal(1), to: journal(2, [1, 0]), ops: [] })).toEqual([]);
        expect(messages({ from: journal(1, [true, false]), to: journal(2), ops: [] })).toEqual([]);
    });

    it('follow a renamed filter', () => {
        const rename: MigrationOp = { kind: 'renameFilter', from: 'voided', to: 'isVoided' };
        expect(messages({ from: journal(1, [true, false]), to: journal(2, [false, true], 'isVoided'), ops: [rename] })).toEqual([]);
        expect(messages({ from: journal(1, [true, false]), to: journal(2, [1, 0], 'isVoided'), ops: [rename] })).toEqual([
            'migration of "journal" to revision 2: filter "isVoided" no longer has the items true, false; map them with mapValues, or reset it'
        ]);
    });

    it('limit a mapping to the stored values among them', () => {
        const migration: ViewMigration = { from: journal(1, [true, false]), to: journal(2, [1, 0]), ops: [mapVoided(value => value === true ? 1 : 0)] };
        const migrated = applyToViewData(migration, stored({ persistedFilterState: { voided: leaf(true) }, savedFilters: [
            { id: 'sf', name: 'Odd', view: 'journal', createdAt: '2026-01-01T00:00:00.000Z', formatRevision: '', state: { voided: leaf('stale') } }
        ] }));

        expect(migrated.data.persistedFilterState).toEqual({ voided: leaf(1) });
        expect(migrated.data.savedFilters[0].state).toEqual({ voided: leaf('stale') });
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

    it('resets a stored sort by what a column sorted by, once it sorts by another field or is dropped', () => {
        const byAmount = { field: 'amount', direction: 'DESC' } as const;
        const byId = { field: 'id', direction: 'ASC' } as const;
        expect(applyToViewData(complete, stored({ ordering: byAmount })).data.ordering).toBeNull();
        expect(applyToViewData(complete, stored({ ordering: byId })).data.ordering).toEqual(byId);

        const withoutAmount: ViewMigration = {
            from: rev1,
            to: { ...rev1, revision: 2, columns: { id: rev1.columns.id, old: rev1.columns.old } },
            ops: [{ kind: 'dropColumn', columnId: 'amount' }]
        };
        expect(applyToViewData(withoutAmount, stored({ ordering: byAmount })).data.ordering).toBeNull();
        expect(applyToViewData(withoutAmount, stored({ ordering: byId })).data.ordering).toEqual(byId);
    });

    it('clears values a mapping drops, and operators mapped to nothing', () => {
        const migration = defineMigration(rev1, rev2, m => [
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
        const migration = defineMigration(rev1, rev2, m => [
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
        const migration = defineMigration(rev1, rev2, m => [
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
        const migration = defineMigration(rev1, rev2, m => [m.custom('amt', 'amount', () => { throw new Error('boom'); })]);

        const migrated = applyToViewData(migration, stored({ persistedFilterState: { amt: leaf(1) } }));

        expect(migrated.data.persistedFilterState).toEqual({});
        expect(migrated.resets.persistedFilterState).toEqual(['amount']);
        error.mockRestore();
    });
});

describe('migration chains', () => {
    const rev3 = { ...rev2, revision: 3, definition: 'payment-list', filters: { ...rev2.filters, merchant: { ...rev2.filters.merchant, field: 'merchantId' } } } as const;
    const chain = defineViewMigrations(rev1, [complete, defineMigration(rev2, rev3, m => [m.reset('merchant')])]);

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
        const live: ViewProjection = { ...rev2, filters: { ...rev2.filters, amount: { ...rev2.filters.amount, cmp: 'greaterThan' }, extra: rev2.filters.merchant } };
        const result = resetFiltersChangedSinceSnapshot(rev2, live, stored({
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
        for (const filter of Object.values(rev1.filters)) {
            expect(projectFilter(expressionOf(filter))).toEqual(filter);
        }
    });
});

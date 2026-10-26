import { describe, expect, it } from '@jest/globals';
import { defineMigration, defineViewMigrations, RESET, type UndecodedFilterFormStateFor } from './migrations';
import type { ViewProjection } from '../framework/view-projection';

// Type-level tests for migrations between two snapshots; they fail if TypeScript cannot
// typecheck. The runtime assertions only check what the builder records.

const range = (field: string) => ({
    kind: 'and',
    children: [
        { kind: 'leaf', cmp: 'greaterThanOrEqual', field, control: { type: 'date' } },
        { kind: 'leaf', cmp: 'lessThanOrEqual', field, control: { type: 'date' } }
    ]
}) as const;

const rev1 = {
    definition: 'payments',
    revision: 1,
    filters: {
        amt: { kind: 'leaf', cmp: 'equals', field: 'amount', control: { type: 'number' } },
        created: range('createdAt'),
        reference: {
            kind: 'leaf',
            cmp: 'equals',
            field: 'reference',
            control: { type: 'customOperator', operators: ['_eq', '_like', '_nlike'], valueControl: { type: 'text' } }
        },
        status: { kind: 'leaf', cmp: 'in', field: 'status', control: { type: 'multiselect' } },
        legacy: { kind: 'leaf', cmp: 'equals', field: 'legacy', control: { type: 'text' } }
    },
    columns: { id: { orderBy: 'id' }, old: { orderBy: null } }
} as const satisfies ViewProjection;

const rev2 = {
    definition: 'payments',
    revision: 2,
    filters: {
        amount: { kind: 'leaf', cmp: 'equals', field: 'amount', control: { type: 'number' } },
        created: range('created_at'),
        reference: {
            kind: 'leaf',
            cmp: 'equals',
            field: 'reference',
            control: { type: 'customOperator', operators: ['_eq', '_ilike'], valueControl: { type: 'text' } }
        },
        status: { kind: 'leaf', cmp: 'in', field: 'status', control: { type: 'dropdown' } },
        createdRange: {
            kind: 'and',
            children: [
                { kind: 'leaf', cmp: 'greaterThanOrEqual', field: 'createdAt', control: { type: 'date' } },
                { kind: 'leaf', cmp: 'lessThanOrEqual', field: 'createdAt', control: { type: 'date' } },
                { kind: 'leaf', cmp: 'equals', field: 'createdAt', control: { type: 'date' } }
            ]
        }
    },
    columns: { id: { orderBy: 'id' }, renamed: { orderBy: null } }
} as const satisfies ViewProjection;

describe('defineMigration typing', () => {
    it('accepts operations that fit the two snapshots', () => {
        const migration = defineMigration(rev1, rev2, m => [
            m.renameFilter('amt', 'amount'),
            m.keep('created', { because: 'the GraphQL field was renamed' }),
            m.mapOperators('reference', { _like: '_ilike', _nlike: null }),
            m.keep('status', { because: 'one of the selected values is still a value' }),
            m.drop('legacy'),
            m.renameColumn('old', 'renamed')
        ]);

        expect(migration.ops.map(op => op.kind)).toEqual(['renameFilter', 'keep', 'mapOperators', 'keep', 'drop', 'renameColumn']);
    });

    it('types custom migrations by the snapshots of both filters', () => {
        const migration = defineMigration(rev1, rev2, m => [
            m.custom('created', 'createdRange', state => {
                // Two children before, three after.
                const [from, to] = state.children;
                return { type: 'and', children: [from, to, { type: 'leaf', value: { type: 'empty' } }] };
            }),
            m.custom('reference', 'reference', state => {
                if (state.value.type !== 'value') return RESET;
                const operator: '_eq' | '_like' | '_nlike' = state.value.value.operator;
                return operator === '_eq' ? { ...state, value: { ...state.value, value: { ...state.value.value, operator } } } : RESET;
            })
        ]);

        expect(migration.ops.map(op => op.kind)).toEqual(['custom', 'custom']);
    });

    it('rejects ids that are not in the right snapshot', () => {
        defineMigration(rev1, rev2, m => [
            // @ts-expect-error 'amount' is not a filter of rev1
            m.reset('amount'),
            // @ts-expect-error 'legacy' is not a filter of rev2
            m.renameFilter('amt', 'legacy'),
            // @ts-expect-error 'created' is still in rev2: it is not dropped
            m.drop('created'),
            // @ts-expect-error 'renamed' is not a column of rev1
            m.dropColumn('renamed')
        ]);
    });

    it('rejects a rename that changes the filter', () => {
        defineMigration(rev1, rev2, m => [
            // @ts-expect-error 'created' has two children, 'createdRange' three
            m.renameFilter('created', 'createdRange')
        ]);
    });

    it('rejects keeping a filter whose stored state no longer fits', () => {
        defineMigration(rev1, rev2, m => [
            // @ts-expect-error '_like' and '_nlike' are no longer operators of 'reference'
            m.keep('reference', { because: 'it is the same filter' })
        ]);
    });

    it('wants a mapping for every operator a filter no longer offers, to one it does', () => {
        defineMigration(rev1, rev2, m => [
            // @ts-expect-error '_nlike' is not mapped
            m.mapOperators('reference', { _like: '_ilike' }),
            // @ts-expect-error '_like' is not an operator of rev2
            m.mapOperators('reference', { _like: '_like', _nlike: null })
        ]);
    });

    it('does not type-check while a decision is left open', () => {
        defineMigration(rev1, rev2, m => [
            // @ts-expect-error a todo has to be replaced
            m.todo('amt', 'rename to amount, or drop?')
        ]);
    });

    it('chains migrations that follow on from each other, and throws on ones that do not', () => {
        const migration = defineMigration(rev1, rev2, m => [m.renameFilter('amt', 'amount')]);

        expect(defineViewMigrations(rev1, [migration]).latest).toBe(rev2);
        expect(() => defineViewMigrations(rev2, [migration])).toThrow('do not follow on');
    });
});

// The stored state of the range filter is a two-tuple of leaves.
type RangeState = UndecodedFilterFormStateFor<typeof rev1.filters.created>;
const rangeState: RangeState = {
    type: 'and',
    children: [{ type: 'leaf', value: { type: 'empty' } }, { type: 'leaf', value: { type: 'legacy', raw: '2026-01-01' } }]
};
// @ts-expect-error three children do not fit a two-child range
const tooLong: RangeState = { type: 'and', children: [rangeState.children[0], rangeState.children[1], rangeState.children[1]] };
void tooLong;

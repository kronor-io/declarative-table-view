import { describe, it, expect } from '@jest/globals';
import { arrayQuery, fieldAlias, objectQuery, valueQuery } from './ast.js';
import { buildSelectionSet, mergeSelectionSets, mergeSelectionSetItem } from './selection-set.js';
import { renderGraphQLQuery, ensureSelectionPath } from './document.js';
import { Hasura } from '../hasura/filter-expression.js';

describe('buildSelectionSet', () => {
    it('lowers nested object queries', () => {
        expect(buildSelectionSet([
            { fieldQuery: objectQuery({ field: 'customer', selectionSet: [valueQuery({ field: 'email' })] }) }
        ])).toEqual([
            { field: 'customer', selections: [{ field: 'email' }] }
        ]);
    });

    it('drops structurally identical duplicates', () => {
        const set = buildSelectionSet([
            { fieldQuery: valueQuery({ field: 'id' }) },
            { fieldQuery: valueQuery({ field: 'id' }) }
        ]);
        expect(set).toEqual([{ field: 'id' }]);
    });

    it('keeps selections that differ only by their where clause', () => {
        const lines = (sku: string) => arrayQuery({
            field: 'lines',
            selectionSet: [valueQuery({ field: 'sku' })],
            where: Hasura.condition('sku', Hasura.eq(sku))
        });
        const set = buildSelectionSet([{ fieldQuery: lines('A') }, { fieldQuery: lines('B') }]);
        expect(set).toHaveLength(2);
    });

    it('applies an alias override over a fieldAlias node', () => {
        const set = buildSelectionSet([
            { fieldQuery: fieldAlias('inner', valueQuery({ field: 'id' })), alias: 'outer' }
        ]);
        expect(set).toEqual([{ field: 'id', alias: 'outer' }]);
    });

    it('carries array query arguments through', () => {
        const set = buildSelectionSet([{
            fieldQuery: arrayQuery({
                field: 'lines',
                selectionSet: [valueQuery({ field: 'sku' })],
                orderBy: { key: 'created.at', direction: 'ASC' },
                distinctOn: ['sku'],
                limit: 5
            })
        }]);
        expect(set[0]).toMatchObject({
            field: 'lines',
            limit: 5,
            distinct_on: ['sku'],
            order_by: { created: { at: 'ASC' } }
        });
    });
});

describe('mergeSelectionSets', () => {
    it('is a no-op when the second set duplicates the first', () => {
        const a = [{ field: 'id' }];
        expect(mergeSelectionSets(a, [{ field: 'id' }])).toEqual([{ field: 'id' }]);
    });

    it('keeps partially overlapping selections apart by default', () => {
        expect(mergeSelectionSets(
            [{ field: 'author', selections: [{ field: 'name' }] }],
            [{ field: 'author', selections: [{ field: 'id' }] }],
        )).toEqual([
            { field: 'author', selections: [{ field: 'name' }] },
            { field: 'author', selections: [{ field: 'id' }] },
        ]);
    });

    it('combines them when mergeNestedSelections is set', () => {
        expect(mergeSelectionSets(
            [{ field: 'author', selections: [{ field: 'name' }] }],
            [{ field: 'author', selections: [{ field: 'id' }] }],
            { mergeNestedSelections: true },
        )).toEqual([
            { field: 'author', selections: [{ field: 'name' }, { field: 'id' }] },
        ]);
    });
});

describe('mergeSelectionSetItem', () => {
    it('appends an item that addresses a field not yet selected', () => {
        expect(mergeSelectionSetItem([{ field: 'id' }], { field: 'name' }))
            .toEqual([{ field: 'id' }, { field: 'name' }]);
    });

    it('merges sub-selections of the same field', () => {
        expect(mergeSelectionSetItem(
            [{ field: 'author', selections: [{ field: 'name' }] }],
            { field: 'author', selections: [{ field: 'id' }] },
        )).toEqual([{ field: 'author', selections: [{ field: 'name' }, { field: 'id' }] }]);
    });

    it('merges recursively', () => {
        expect(mergeSelectionSetItem(
            [{ field: 'a', selections: [{ field: 'b', selections: [{ field: 'c' }] }] }],
            { field: 'a', selections: [{ field: 'b', selections: [{ field: 'd' }] }] },
        )).toEqual([
            { field: 'a', selections: [{ field: 'b', selections: [{ field: 'c' }, { field: 'd' }] }] },
        ]);
    });

    it('keeps the sub-selection when the same field is also selected bare', () => {
        expect(mergeSelectionSetItem(
            [{ field: 'author', selections: [{ field: 'name' }] }],
            { field: 'author' },
        )).toEqual([{ field: 'author', selections: [{ field: 'name' }] }]);
    });

    it('does not merge items whose arguments differ', () => {
        const paid = { field: 'orders', where: Hasura.condition('status', Hasura.eq('PAID')), selections: [{ field: 'id' }] };
        const open = { field: 'orders', where: Hasura.condition('status', Hasura.eq('OPEN')), selections: [{ field: 'id' }] };

        expect(mergeSelectionSetItem([paid], open)).toEqual([paid, open]);
    });

    it('does not merge items that differ only by offset', () => {
        const first = { field: 'lines', limit: 5, offset: 0, selections: [{ field: 'sku' }] };
        const second = { field: 'lines', limit: 5, offset: 5, selections: [{ field: 'sku' }] };

        expect(mergeSelectionSetItem([first], second)).toEqual([first, second]);
    });

    it('does not mutate the set it is given', () => {
        const set = [{ field: 'author', selections: [{ field: 'name' }] }];
        mergeSelectionSetItem(set, { field: 'author', selections: [{ field: 'id' }] });

        expect(set).toEqual([{ field: 'author', selections: [{ field: 'name' }] }]);
    });
});

describe('buildSelectionSet with mergeNestedSelections', () => {
    it('builds one selection per field from independently contributed paths', () => {
        const set = buildSelectionSet([
            { fieldQuery: objectQuery({ field: 'vendor', selectionSet: [valueQuery({ field: 'name' })] }) },
            { fieldQuery: objectQuery({ field: 'vendor', selectionSet: [valueQuery({ field: 'id' })] }) },
        ], { mergeNestedSelections: true });

        expect(set).toEqual([{ field: 'vendor', selections: [{ field: 'name' }, { field: 'id' }] }]);
    });

    it('still keeps selections apart when their where clauses differ', () => {
        const lines = (sku: string) => arrayQuery({
            field: 'lines',
            selectionSet: [valueQuery({ field: 'sku' })],
            where: Hasura.condition('sku', Hasura.eq(sku))
        });
        const set = buildSelectionSet(
            [{ fieldQuery: lines('A') }, { fieldQuery: lines('B') }],
            { mergeNestedSelections: true },
        );

        expect(set).toHaveLength(2);
    });
});

describe('ensureSelectionPath', () => {
    it('adds a missing nested path', () => {
        expect(ensureSelectionPath([{ field: 'id' }], 'meta.cursor')).toEqual([
            { field: 'id' },
            { field: 'meta', selections: [{ field: 'cursor' }] }
        ]);
    });

    it('leaves an already-selected path alone', () => {
        const set = [{ field: 'meta', selections: [{ field: 'cursor' }] }];
        expect(ensureSelectionPath(set, 'meta.cursor')).toEqual(set);
    });

    it('matches an aliased selection', () => {
        const set = [{ field: 'createdAt', alias: 'cursor' }];
        expect(ensureSelectionPath(set, 'cursor')).toEqual(set);
    });
});

describe('renderGraphQLQuery', () => {
    it('renders variables, root-field args and a nested selection set', () => {
        const query = renderGraphQLQuery({
            operation: 'query',
            variables: [{ name: 'conditions', type: 'order_bool_exp!' }],
            rootField: {
                field: 'orders',
                args: [{ name: 'where', value: { type: 'variable', name: 'conditions' } }]
            },
            selectionSet: buildSelectionSet([
                { fieldQuery: valueQuery({ field: 'id' }) },
                { fieldQuery: objectQuery({ field: 'customer', selectionSet: [valueQuery({ field: 'email' })] }) }
            ])
        });

        expect(query).toContain('query($conditions: order_bool_exp!)');
        expect(query).toContain('orders(where: $conditions)');
        expect(query).toContain('customer {');
        expect(query).toContain('email');
    });

    it('renders a where clause on a collection selection', () => {
        const query = renderGraphQLQuery({
            operation: 'query',
            variables: [],
            rootField: { field: 'orders' },
            selectionSet: buildSelectionSet([{
                fieldQuery: arrayQuery({
                    field: 'lines',
                    selectionSet: [valueQuery({ field: 'sku' })],
                    where: Hasura.condition('qty', Hasura.gt(0))
                })
            }])
        });

        expect(query).toContain('lines(where: {qty: {_gt: 0}})');
    });
});

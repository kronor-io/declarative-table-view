import { describe, expect, it } from '@jest/globals';
import { aggregateQueryForType } from './aggregate-builder.js';
import { rowType } from './query-builder.js';
import { aggregateRootField } from '../query/aggregate.js';
import { graphqlVariableReference, renderGraphQLQuery } from '../query/document.js';
import type { DataFromSelectionSetForRow } from '../query/row-types.js';

// The shape Hasura generates for `orders_aggregate.aggregate`
type OrdersAggregateFields = {
    count: number;
    sum: { amount: number | null; vat: number | null } | null;
    avg: { amount: number | null; vat: number | null } | null;
    max: { amount: number | null; createdAt: string | null } | null;
    min: { amount: number | null; createdAt: string | null } | null;
};

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<T extends true>(): T | void { }

describe('aggregateQueryForType', () => {
    const a = aggregateQueryForType(rowType<OrdersAggregateFields>());

    it('builds plain value and object queries', () => {
        expect(a.count()).toEqual({ type: 'valueQuery', field: 'count' });
        expect(a.sum('amount', 'vat')).toEqual({
            type: 'objectQuery',
            field: 'sum',
            selectionSet: [{ type: 'valueQuery', field: 'amount' }, { type: 'valueQuery', field: 'vat' }]
        });
        expect(a.max('createdAt').field).toBe('max');
        expect(a.value({ field: 'count' })).toEqual({ type: 'valueQuery', field: 'count' });
    });

    it('types what is selected against the aggregate fields', () => {
        const selection = [a.count(), a.sum('amount'), a.max('createdAt')] as const;
        expect(selection).toHaveLength(3);
        type Data = DataFromSelectionSetForRow<OrdersAggregateFields, typeof selection>;
        assertType<Equal<Data, {
            count: number;
            sum: { amount: number | null } | null;
            max: { createdAt: string | null } | null;
        }>>();

        // Type checks only
        void (() => {
            // @ts-expect-error `sum` does not apply to a column that is not summable
            a.sum('createdAt');
            // @ts-expect-error an aggregate function needs a column
            a.sum();
            // @ts-expect-error no such field
            a.value({ field: 'total' });
        });
    });

    it('rejects a call without columns at runtime too', () => {
        expect(() => (a.sum as (...columns: string[]) => unknown)()).toThrow('needs at least one column');
    });
});

describe('aggregateRootField', () => {
    it('renders the selection inside `aggregate`, combining selections of one function', () => {
        const a = aggregateQueryForType<OrdersAggregateFields>();
        const query = renderGraphQLQuery({
            operation: 'query',
            variables: [{ name: 'conditions', type: 'orders_bool_exp!' }],
            rootFields: [
                aggregateRootField({
                    field: 'orders_aggregate',
                    alias: 'totals',
                    args: [{ name: 'where', value: graphqlVariableReference('conditions') }],
                    selectionSet: [a.count(), a.sum('amount'), a.sum('vat'), a.count()]
                })
            ]
        });

        expect(query.replace(/\s+/g, ' ')).toContain(
            'totals: orders_aggregate(where: $conditions) { aggregate { count sum { amount vat } } }'
        );
    });

    it('leaves out an empty argument list', () => {
        const field = aggregateRootField({ field: 'orders_aggregate', args: [], selectionSet: [] });
        expect(field).toEqual({ field: 'orders_aggregate', selectionSet: [{ field: 'aggregate', selections: [] }] });
    });
});

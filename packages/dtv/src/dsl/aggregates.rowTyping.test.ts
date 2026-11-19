import { describe, expect, it } from '@jest/globals';
import { aggregate } from './aggregates';
import { column, fieldColumn, rowType, valueQuery } from './columns';
import { view } from './view';
import type { AggregateState, AggregateStatesOf } from './index';

type OrderRow = {
    id: string;
    amount: number;
    status: string;
    dueDate: string | null;
};

// As typegen emits it for `orders_aggregate.aggregate`
type OrdersAggregateFields = {
    count: number;
    sum: { amount: number | null } | null;
    max: { amount: number | null; dueDate: string | null } | null;
};

const OrderRowType = rowType<OrderRow>();
const OrdersAggregateType = rowType<OrdersAggregateFields>();

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<T extends true>(): T | void { }

const totals = aggregate({
    aggregateType: OrdersAggregateType,
    select: a => [a.count(), a.sum('amount')],
});

const overdue = aggregate({
    aggregateType: OrdersAggregateType,
    rowType: OrderRowType,
    where: h => h.condition('dueDate', h.lt('2026-11-19')),
    select: a => [a.sum('amount')],
});

describe('DSL.aggregate typing', () => {
    it('types what the aggregate selects with the aggregate type', () => {
        type TotalsData = NonNullable<typeof totals.data>;
        assertType<Equal<TotalsData, { count: number; sum: { amount: number | null } | null }>>();
        expect(totals).toEqual({
            type: 'aggregate',
            selectionSet: [
                { type: 'valueQuery', field: 'count' },
                { type: 'objectQuery', field: 'sum', selectionSet: [{ type: 'valueQuery', field: 'amount' }] }
            ]
        });
        expect(overdue.where).toBeDefined();

        void (() => {
            aggregate({
                aggregateType: OrdersAggregateType,
                // @ts-expect-error not a column `sum` applies to
                select: a => [a.sum('status')],
            });
            aggregate({
                aggregateType: OrdersAggregateType,
                rowType: OrderRowType,
                // @ts-expect-error not a field of the row
                where: h => h.condition('missing', h.eq(1)),
                select: a => [a.count()],
            });
        });
    });

    it('gives a column the states of the aggregates it declares', () => {
        const amount = column({
            rowType: OrderRowType,
            aggregates: { totals, overdue },
            id: 'amount',
            name: 'Amount',
            data: [valueQuery({ field: 'amount' })],
            cellRenderer: ({ data, aggregates }) => {
                const total = aggregates.totals.state === 'ready' ? aggregates.totals.data.sum?.amount : null;
                assertType<Equal<typeof total, number | null | undefined>>();
                return total ? `${(data.amount / total) * 100}%` : null;
            },
            footerRenderer: ({ aggregates }) => {
                assertType<Equal<typeof aggregates.overdue, AggregateState<{ sum: { amount: number | null } | null }>>>();
                // @ts-expect-error the column does not declare it
                void aggregates.other;
                return aggregates.totals.state === 'ready' ? String(aggregates.totals.data.count) : null;
            },
        });
        expect(amount.aggregates).toEqual({ totals, overdue });

        const status = fieldColumn({
            rowType: OrderRowType,
            field: 'status',
            name: 'Status',
            aggregates: { totals },
            cellRenderer: ({ value, aggregates }) => (aggregates.totals.state === 'ready' ? `${value} of ${aggregates.totals.data.count}` : value),
            footerRenderer: ({ aggregates }) => (aggregates.totals.state === 'error' ? 'n/a' : null),
        });
        expect(status.footerRenderer).toBeDefined();

        void (() => column({
            rowType: OrderRowType,
            id: 'id',
            name: 'Id',
            data: [valueQuery({ field: 'id' })],
            // @ts-expect-error a column without aggregates gets none
            cellRenderer: ({ aggregates }) => aggregates.totals,
        }));
    });

    it('types the states the host gets by the view', () => {
        const orders = view({
            title: 'Orders',
            id: 'orders',
            source: { type: 'collection', collectionName: 'orders' },
            columnDefinitions: [],
            filterGroups: [],
            boolExpType: 'orders_bool_exp',
            orderByType: '[orders_order_by!]',
            paginationKey: 'id',
            aggregates: { totals, overdue },
            totalCount: 'totals',
        });

        type States = AggregateStatesOf<typeof orders>;
        assertType<Equal<keyof States, 'totals' | 'overdue'>>();
        assertType<Equal<States['totals'], AggregateState<{ count: number; sum: { amount: number | null } | null }>>>();

        void (() => view({
            ...orders,
            // @ts-expect-error not an aggregate of the view
            totalCount: 'missing',
        }));
    });

    it('rejects a column reading an aggregate the view does not have', () => {
        const amount = column({
            rowType: OrderRowType,
            aggregates: { totals },
            id: 'amount',
            name: 'Amount',
            data: [valueQuery({ field: 'amount' })],
            cellRenderer: () => null,
        });
        expect(() => view({
            title: 'Orders',
            id: 'orders',
            source: { type: 'collection', collectionName: 'orders' },
            columnDefinitions: [amount],
            filterGroups: [],
            boolExpType: 'orders_bool_exp',
            orderByType: '[orders_order_by!]',
            paginationKey: 'id',
            aggregates: { overdue },
        })).toThrow('reads aggregate "totals", which the view does not have');
    });
});

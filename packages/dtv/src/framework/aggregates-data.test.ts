import { aggregateQueryForType, Hasura } from '@kronor/hasura-graphql';
import { buildAggregatesQueryVariables, fetchAggregates, generateAggregatesQuery } from './aggregates-data';
import { assertValidAggregates, type AggregateDefinition } from './aggregates';
import type { ColumnDefinition, TableColumnDefinition } from './column-definition';
import type { FilterGroups } from './filters';
import type { View } from './view';

type OrdersAggregateFields = {
    count: number;
    sum: { amount: number | null; vat: number | null } | null;
};

const a = aggregateQueryForType<OrdersAggregateFields>();

const totals: AggregateDefinition = { type: 'aggregate', selectionSet: [a.count(), a.sum('amount', 'vat')] };
const overdue: AggregateDefinition = {
    type: 'aggregate',
    selectionSet: [a.sum('amount')],
    where: Hasura.condition('status', Hasura.eq('OVERDUE'))
};

const column = (aggregates?: TableColumnDefinition['aggregates']): ColumnDefinition => ({
    type: 'tableColumn',
    id: 'amount',
    name: 'Amount',
    data: [{ type: 'valueQuery', field: 'amount' }],
    ...(aggregates ? { aggregates } : {}),
    cellRenderer: () => null
});

const baseView: View = {
    title: 'Orders',
    id: 'orders',
    source: { type: 'collection', collectionName: 'orders' },
    columnDefinitions: [column()],
    filterGroups: [] as FilterGroups,
    boolExpType: 'orders_bool_exp',
    orderByType: '[orders_order_by!]',
    paginationKey: 'id',
    staticConditions: [Hasura.condition('deleted', Hasura.eq(false))],
    aggregates: { totals, overdue }
};

const squash = (query: string | null) => query?.replace(/\s+/g, ' ').trim();

describe('generateAggregatesQuery', () => {
    it('selects each aggregate under its name, over the rows the conditions match', () => {
        expect(squash(generateAggregatesQuery(baseView))).toBe(squash(`
            query($conditions: orders_bool_exp!) {
                totals: orders_aggregate(where: $conditions) { aggregate { count sum { amount vat } } }
                overdue: orders_aggregate(where: {_and: [$conditions, {status: {_eq: "OVERDUE"}}]}) { aggregate { sum { amount } } }
            }
        `));
    });

    it('passes a function view its arguments, and takes a renamed aggregate root field', () => {
        const view: View = {
            ...baseView,
            source: { type: 'function', functionName: 'getOrders', args: { p_period: '2026-10-31' }, aggregateName: 'getOrdersTotals' },
            aggregates: { totals }
        };
        expect(squash(generateAggregatesQuery(view))).toContain(
            'totals: getOrdersTotals(args: {p_period: "2026-10-31"}, where: $conditions)'
        );
    });

    it('is null for a view without aggregates', () => {
        expect(generateAggregatesQuery({ ...baseView, aggregates: undefined })).toBeNull();
        expect(generateAggregatesQuery({ ...baseView, aggregates: {} })).toBeNull();
    });
});

describe('buildAggregatesQueryVariables', () => {
    it('holds the conditions the rows are read with, static ones included', () => {
        expect(buildAggregatesQueryVariables(baseView, new Map())).toEqual({ conditions: { deleted: { _eq: false } } });
    });
});

describe('fetchAggregates', () => {
    const fetch = (client: unknown, signal?: AbortSignal) => fetchAggregates({
        client: client as never,
        view: baseView,
        query: 'query',
        filterState: new Map(),
        signal
    });

    it("hands back each aggregate's `aggregate` object by name", async () => {
        const client = {
            request: jest.fn(async () => ({
                totals: { aggregate: { count: 3, sum: { amount: 30, vat: 6 } } },
                overdue: { aggregate: { sum: { amount: 10 } } }
            }))
        };
        await expect(fetch(client)).resolves.toEqual({
            totals: { count: 3, sum: { amount: 30, vat: 6 } },
            overdue: { sum: { amount: 10 } }
        });
        expect(client.request).toHaveBeenCalledWith('query', { conditions: { deleted: { _eq: false } } }, { signal: undefined });
    });

    it('rejects a response missing an aggregate', async () => {
        const client = { request: async () => ({ totals: { aggregate: { count: 3 } } }) };
        await expect(fetch(client)).rejects.toMatchObject({ name: 'FetchError', info: { kind: 'unexpectedResponse' } });
    });

    it('tells what kind of failure a failed request was', async () => {
        const client = { request: async () => { throw new TypeError('Failed to fetch'); } };
        await expect(fetch(client)).rejects.toMatchObject({ name: 'FetchError', info: { kind: 'network' } });
    });

    it('rejects with an AbortError once aborted, whatever the client did', async () => {
        const controller = new AbortController();
        const client = { request: async () => { controller.abort(); return { totals: { aggregate: {} }, overdue: { aggregate: {} } }; } };
        await expect(fetch(client, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });
});

describe('assertValidAggregates', () => {
    it('accepts columns reading the aggregates of the view', () => {
        expect(() => assertValidAggregates({ ...baseView, columnDefinitions: [column({ totals })], totalCount: 'totals' })).not.toThrow();
    });

    it('accepts a structurally equal aggregate, as a JSON view has', () => {
        const copy: AggregateDefinition = JSON.parse(JSON.stringify(totals));
        expect(() => assertValidAggregates({ ...baseView, columnDefinitions: [column({ totals: copy })] })).not.toThrow();
    });

    it('rejects a name that cannot be a GraphQL alias', () => {
        expect(() => assertValidAggregates({ ...baseView, aggregates: { 'grand total': totals } }))
            .toThrow('"grand total" is not a valid name');
    });

    it('rejects a column reading an aggregate the view does not have, or has another of', () => {
        expect(() => assertValidAggregates({ ...baseView, columnDefinitions: [column({ missing: totals })] }))
            .toThrow('reads aggregate "missing", which the view does not have');
        expect(() => assertValidAggregates({ ...baseView, columnDefinitions: [column({ totals: overdue })] }))
            .toThrow("the view's aggregate of that name is another one");
    });

    it('rejects a totalCount that names no aggregate selecting count', () => {
        expect(() => assertValidAggregates({ ...baseView, totalCount: 'missing' })).toThrow('there is no aggregate "missing"');
        expect(() => assertValidAggregates({ ...baseView, totalCount: 'overdue' })).toThrow('does not select count');
    });
});

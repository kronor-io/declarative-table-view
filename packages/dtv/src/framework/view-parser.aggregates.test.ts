import { parseViewJson } from './view-parser';
import type { Runtime } from './runtime';
import type { TableColumnDefinition } from './column-definition';

const runtime: Runtime = {
    cellRenderers: { text: () => 'text' },
    footerRenderers: { total: ({ aggregates }) => (aggregates.totals?.state === 'ready' ? 'total' : null) },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

const count = { type: 'valueQuery', field: 'count' };
const sumAmount = { type: 'objectQuery', field: 'sum', selectionSet: [{ type: 'valueQuery', field: 'amount' }] };
const overdueWhere = { kind: 'where', path: ['status'], operator: { _eq: 'OVERDUE' } };

const viewJson = (overrides: Record<string, unknown> = {}, column: Record<string, unknown> = {}) => ({
    title: 'Orders',
    id: 'orders',
    source: { type: 'function', functionName: 'getOrders', aggregateName: 'getOrdersTotals' },
    paginationKey: 'id',
    boolExpType: 'orders_bool_exp',
    orderByType: '[orders_order_by!]',
    columns: [{
        type: 'tableColumn',
        id: 'amount',
        data: [{ type: 'valueQuery', field: 'amount' }],
        name: 'Amount',
        aggregates: ['totals'],
        footerRenderer: { section: 'footerRenderers', key: 'total' },
        cellRenderer: { section: 'cellRenderers', key: 'text' },
        ...column
    }],
    filterSchema: { groups: [{ name: 'default', label: null }], filters: [] },
    aggregates: {
        totals: { select: [count, sumAmount] },
        overdue: { select: [sumAmount], where: overdueWhere }
    },
    totalCount: 'totals',
    ...overrides
});

describe('parseViewJson aggregates', () => {
    it('parses the aggregates, totalCount, the aggregate root field and what a column reads', () => {
        const view = parseViewJson(viewJson(), runtime);

        expect(view.aggregates).toEqual({
            totals: { type: 'aggregate', selectionSet: [count, sumAmount] },
            overdue: { type: 'aggregate', selectionSet: [sumAmount], where: overdueWhere }
        });
        expect(view.totalCount).toBe('totals');
        expect(view.source.aggregateName).toBe('getOrdersTotals');

        const column = view.columnDefinitions[0] as TableColumnDefinition;
        expect(column.aggregates).toEqual({ totals: view.aggregates?.totals });
        expect(column.footerRenderer).toBe(runtime.footerRenderers?.total);
    });

    it('rejects a column reading an aggregate the view does not have', () => {
        expect(() => parseViewJson(viewJson({}, { aggregates: ['missing'] }), runtime))
            .toThrow('reads aggregate "missing", which the view does not have');
    });

    it('rejects a footerRenderer that is not in the runtime, or of another section', () => {
        expect(() => parseViewJson(viewJson({}, { footerRenderer: { section: 'footerRenderers', key: 'nope' } }), runtime))
            .toThrow('Invalid footerRenderer reference: "nope"');
        expect(() => parseViewJson(viewJson({}, { footerRenderer: { section: 'cellRenderers', key: 'text' } }), runtime))
            .toThrow('section must be "footerRenderers"');
    });

    it('rejects malformed aggregates', () => {
        expect(() => parseViewJson(viewJson({ aggregates: [] }), runtime)).toThrow('"aggregates" must be an object');
        expect(() => parseViewJson(viewJson({ aggregates: { totals: { select: 'count' } } }), runtime)).toThrow('"select" must be an array');
        expect(() => parseViewJson(viewJson({ aggregates: { totals: { select: [{ type: 'nope' }] } } }), runtime)).toThrow('invalid select[0]');
        expect(() => parseViewJson(viewJson({ aggregates: { 'grand total': { select: [count] } }, totalCount: undefined }, { aggregates: undefined }), runtime))
            .toThrow('"grand total" is not a valid name');
    });

    it('rejects a totalCount naming no aggregate that selects count', () => {
        expect(() => parseViewJson(viewJson({ totalCount: 'overdue' }), runtime)).toThrow('does not select count');
        expect(() => parseViewJson(viewJson({ totalCount: 3 }), runtime)).toThrow('"totalCount" must be the name of an aggregate');
    });

    it('leaves a view without aggregates as it was', () => {
        const view = parseViewJson(viewJson({ aggregates: undefined, totalCount: undefined }, { aggregates: undefined, footerRenderer: undefined }), runtime);
        expect(view).not.toHaveProperty('aggregates');
        expect(view).not.toHaveProperty('totalCount');
        expect(view.columnDefinitions[0]).not.toHaveProperty('aggregates');
    });
});

import { describe, it, expect } from '@jest/globals';
import { getViewQuery, viewWithQuery, type View } from './view';

const linesOf = (invoiceId: string): View => ({
    title: 'Invoice lines',
    id: 'invoice-lines',
    source: { type: 'function', functionName: 'invoiceLines', args: { invoiceId } },
    paginationKey: 'id',
    boolExpType: 'InvoiceLineBoolExp',
    orderByType: '[InvoiceLineOrderBy!]',
    staticConditions: [{ kind: 'where', path: ['invoiceId'], operator: { _eq: invoiceId } }],
    staticOrdering: [{ lineNo: 'ASC' }],
    columnDefinitions: [],
    filterGroups: []
});

describe('viewWithQuery', () => {
    it('is the view itself while it reads its rows the same way, built again or not', () => {
        const view = linesOf('A');

        expect(viewWithQuery(view, getViewQuery(linesOf('A')))).toBe(view);
        expect(viewWithQuery(view, null)).toBe(view);
    });

    it('reads the rows the way the view query says, the rest of the view as it is', () => {
        const view = linesOf('B');

        const queried = viewWithQuery(view, getViewQuery(linesOf('A')));

        expect(getViewQuery(queried)).toEqual(getViewQuery(linesOf('A')));
        expect(queried.columnDefinitions).toBe(view.columnDefinitions);
    });
});

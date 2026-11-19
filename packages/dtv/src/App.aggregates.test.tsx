/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import type { View } from './framework/view';
import type { AggregateDefinition, AggregateStates } from './framework/aggregates';
import type { DTVAPI } from './App';

const requests: { document: string; variables: any }[] = [];
let failAggregates = false;

// Five orders, paged two at a time; the aggregates sum all five
jest.mock('./framework/graphql-client', () => {
    const orders = [5, 4, 3, 2, 1].map(id => ({ id, amount: id * 10 }));
    return {
        createGraphQLClient: jest.fn(() => ({
            request: jest.fn(async (document: string, variables: any) => {
                requests.push({ document, variables });
                if (document.includes('orders_aggregate')) {
                    if (failAggregates) throw new Error('aggregates are not allowed');
                    return { totals: { aggregate: { count: 5, sum: { amount: 150 } } } };
                }
                const cursor = JSON.stringify(variables.paginationCondition).match(/"_lt":(\d+)/);
                const after = cursor ? Number(cursor[1]) : Infinity;
                return { orders: orders.filter(order => order.id < after).slice(0, variables.rowLimit) };
            })
        }))
    };
});

import App from './App';
import { waitUntil } from './test/waitUntil';

const totals: AggregateDefinition = {
    type: 'aggregate',
    selectionSet: [
        { type: 'valueQuery', field: 'count' },
        { type: 'objectQuery', field: 'sum', selectionSet: [{ type: 'valueQuery', field: 'amount' }] }
    ]
};

const ordersView: View = {
    title: 'Orders',
    id: 'orders',
    source: { type: 'collection', collectionName: 'orders' },
    paginationKey: 'id',
    boolExpType: 'orders_bool_exp',
    orderByType: '[orders_order_by!]',
    aggregates: { totals },
    totalCount: 'totals',
    columnDefinitions: [{
        type: 'tableColumn',
        id: 'amount',
        name: 'Amount',
        data: [{ type: 'valueQuery', field: 'amount' }],
        aggregates: { totals },
        cellRenderer: ({ data, aggregates }) => {
            const total = aggregates.totals?.state === 'ready' ? (aggregates.totals.data.sum as { amount: number }).amount : null;
            return total === null ? `amount ${String(data.amount)}` : `amount ${String(data.amount)} (${(Number(data.amount) / total) * 100}%)`;
        },
        footerRenderer: ({ aggregates }) => {
            const state = aggregates.totals;
            if (state?.state === 'ready') return `total ${(state.data.sum as { amount: number }).amount}`;
            return state?.state === 'error' ? 'total unavailable' : 'total loading';
        }
    }],
    filterGroups: [{ name: 'default', label: null, filters: [] }]
};

function mount(onAggregatesChange?: (viewId: string, aggregates: AggregateStates) => void) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const apiRef = React.createRef<DTVAPI | null>() as React.RefObject<DTVAPI | null>;
    const render = async (views: View[]) => {
        await act(async () => {
            root.render(React.createElement(PrimeReactProvider, {
                value: {},
                children: React.createElement(App, {
                    graphqlHost: 'http://example.com/graphql',
                    requestHeaders: {},
                    showViewsMenu: false,
                    showViewTitle: false,
                    views,
                    syncFilterStateToUrl: false,
                    rowsPerPageOptions: [2],
                    apiRef,
                    onAggregatesChange
                })
            }));
        });
    };
    const unmount = async () => {
        await act(async () => { root.unmount(); });
        container.remove();
    };
    return { container, render, unmount, apiRef };
}

const aggregateRequests = () => requests.filter(request => request.document.includes('orders_aggregate'));
const text = (container: HTMLElement) => container.textContent ?? '';

describe('App with aggregates', () => {
    beforeEach(() => {
        requests.length = 0;
        failAggregates = false;
        localStorage.clear();
    });

    it('shows them in footers, cells and the pager, and keeps them while paging', async () => {
        const onAggregatesChange = jest.fn<(viewId: string, aggregates: AggregateStates) => void>();
        const { container, render, unmount, apiRef } = mount(onAggregatesChange);

        await render([ordersView]);
        await waitUntil(() => text(container).includes('total 150'), { description: 'the total in the footer' });

        expect(text(container)).toContain('amount 50 (33.33333333333333%)');
        expect(container.querySelector('[data-testid="pagination-total"]')?.textContent).toBe('5');
        expect(aggregateRequests()).toHaveLength(1);
        expect(aggregateRequests()[0]?.variables).toEqual({ conditions: {} });
        expect(onAggregatesChange).toHaveBeenLastCalledWith('orders', { totals: { state: 'ready', data: { count: 5, sum: { amount: 150 } } } });
        expect(apiRef.current?.getAggregates()).toEqual({ viewId: 'orders', aggregates: { totals: { state: 'ready', data: { count: 5, sum: { amount: 150 } } } } });

        await act(async () => {
            container.querySelector<HTMLButtonElement>('[data-testid="pagination-next"]')?.click();
        });
        await waitUntil(() => text(container).includes('amount 30'), { description: 'the second page' });
        expect(text(container)).toContain('total 150');
        expect(aggregateRequests()).toHaveLength(1);

        // Refreshing asks for the aggregates again
        await act(async () => { apiRef.current?.fetchData(); });
        await waitUntil(() => aggregateRequests().length === 2, { description: 'the aggregates asked for again' });

        await unmount();
    });

    it('shows the rows when the aggregates fail', async () => {
        failAggregates = true;
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const { container, render, unmount } = mount();

        await render([ordersView]);
        await waitUntil(() => text(container).includes('total unavailable'), { description: 'the footer telling the total failed' });

        expect(text(container)).toContain('amount 50');
        expect(container.querySelector('[data-testid="pagination-total"]')).toBeNull();

        await unmount();
        error.mockRestore();
    });

    it('asks for no aggregates for a view without any', async () => {
        const onAggregatesChange = jest.fn();
        const { container, render, unmount } = mount(onAggregatesChange);
        const plain: View = {
            ...ordersView,
            aggregates: undefined,
            totalCount: undefined,
            columnDefinitions: [{ ...ordersView.columnDefinitions[0], aggregates: undefined } as View['columnDefinitions'][number]]
        };

        await render([plain]);
        await waitUntil(() => text(container).includes('amount 50'), { description: 'the rows' });

        expect(aggregateRequests()).toHaveLength(0);
        expect(onAggregatesChange).not.toHaveBeenCalled();
        expect(text(container)).toContain('total loading');

        await unmount();
    });
});

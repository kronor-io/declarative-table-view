/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

const requests: { query: string; variables: any }[] = [];

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async (query: string, variables: any) => {
                requests.push({ query, variables });
                return { testCollection: [] };
            })
        }))
    };
});

import App from './App';
import { waitUntil } from './test/waitUntil';

const column = (id: string, name: string, field: string) => ({
    type: 'tableColumn',
    id,
    name,
    data: [{ type: 'valueQuery', field }],
    cellRenderer: { section: 'cellRenderers', key: 'text' }
});

const viewsJson = JSON.stringify([
    {
        title: 'Test View',
        id: 'static-ordering-view',
        source: { type: 'collection', collectionName: 'testCollection' },
        paginationKey: 'id',
        boolExpType: 'TestBoolExp',
        orderByType: '[TestOrderBy!]',
        staticOrdering: [{ status: 'ASC' }],
        columns: [column('id', 'ID', 'id'), column('amount', 'Amount', 'amount')],
        filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
    }
]);

const lastOrderBy = () => requests[requests.length - 1]?.variables?.orderBy;

describe('App staticOrdering', () => {
    beforeEach(() => {
        requests.length = 0;
        localStorage.clear();
    });

    it('orders by staticOrdering when the user has not sorted, and keeps it as a tie-breaker once they do', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const runtime = { cellRenderers: { text: () => 'cell' }, queryTransforms: {}, noRowsComponents: {}, customFilterComponents: {}, initialValues: {} };

        const root = createRoot(container);
        await act(async () => {
            root.render(React.createElement(PrimeReactProvider, {
                value: {},
                children: React.createElement(App, {
                    graphqlHost: 'http://example.com/graphql',
                    requestHeaders: {},
                    aiIntegration: { type: 'builtInGemini' as const, geminiApiKey: 'gemini' },
                    showViewsMenu: false,
                    showViewTitle: false,
                    viewsJson,
                    externalRuntime: runtime as any,
                    syncFilterStateToUrl: false
                })
            }));
        });
        await waitUntil(() => requests.length > 0, { description: 'the initial data request' });

        // The unsorted table must still order by the view's staticOrdering — it used to
        // send the pagination key alone, dropping staticOrdering entirely.
        expect(lastOrderBy()).toEqual([{ status: 'ASC' }, { id: 'DESC' }]);

        const header = Array.from(container.querySelectorAll('th.p-sortable-column'))
            .find(element => element.textContent?.includes('Amount')) as HTMLElement | undefined;
        if (!header) throw new Error('Sortable column header "Amount" not found');
        const requestsBeforeSort = requests.length;
        await act(async () => {
            header.click();
            await waitUntil(() => requests.length > requestsBeforeSort, { description: 'the re-sorted data request' });
        });

        expect(lastOrderBy()).toEqual([{ amount: 'ASC' }, { status: 'ASC' }, { id: 'DESC' }]);

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});

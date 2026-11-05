/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import type { View } from './framework/view';

const requests: { variables: any }[] = [];

// The lines of invoice B differ from those of A
jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async ({ variables }: { variables: any }) => {
                requests.push({ variables });
                const isB = JSON.stringify(variables.conditions).includes('"B"');
                return { invoiceLines: isB ? [{ id: 3 }] : [{ id: 1 }, { id: 2 }] };
            })
        }))
    };
}, { virtual: true });

import App from './App';
import { waitUntil } from './test/waitUntil';

const linesOf = (invoiceId: string): View[] => [{
    title: 'Invoice lines',
    id: 'invoice-lines',
    source: { type: 'collection', collectionName: 'invoiceLines' },
    paginationKey: 'id',
    boolExpType: 'InvoiceLineBoolExp',
    orderByType: '[InvoiceLineOrderBy!]',
    staticConditions: [{ kind: 'where', path: ['invoiceId'], operator: { _eq: invoiceId } }],
    columnDefinitions: [{
        type: 'tableColumn',
        id: 'id',
        name: 'ID',
        data: [{ type: 'valueQuery', field: 'id' }],
        cellRenderer: ({ data }) => `line ${String(data.id)}`
    }],
    filterGroups: [{ name: 'default', label: null, filters: [] }]
}];

const lastConditions = () => JSON.stringify(requests.at(-1)?.variables.conditions);

describe('App when the host changes what a view is read with', () => {
    beforeEach(() => {
        requests.length = 0;
        localStorage.clear();
    });

    it('asks for the rows again, and tells the host the selected rows are gone', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onRowSelectionChange = jest.fn();

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
                        rowSelection: { rowSelectionType: 'multiple', onRowSelectionChange }
                    })
                }));
            });
        };
        const rowCheckboxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));

        await render(linesOf('A'));
        await waitUntil(() => (container.textContent ?? '').includes('line 2'), { description: 'the lines of invoice A' });
        expect(lastConditions()).toContain('"A"');

        await act(async () => {
            rowCheckboxes()[0]?.click();
        });
        expect(onRowSelectionChange).toHaveBeenLastCalledWith([{ id: 1 }]);

        // The same view, built again: nothing to ask for
        const requestCount = requests.length;
        await render(linesOf('A'));
        expect(requests).toHaveLength(requestCount);

        await render(linesOf('B'));
        await waitUntil(() => (container.textContent ?? '').includes('line 3'), { description: 'the lines of invoice B' });

        expect(lastConditions()).toContain('"B"');
        expect(container.textContent).not.toContain('line 1');
        expect(onRowSelectionChange).toHaveBeenLastCalledWith([]);
        expect(rowCheckboxes().some(checkbox => checkbox.checked)).toBe(false);

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});

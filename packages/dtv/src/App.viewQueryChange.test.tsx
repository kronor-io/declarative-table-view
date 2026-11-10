/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import type { SimplifiedRow, View } from './framework/view';

const requests: { document: string; variables: any }[] = [];
// The rows of invoice B are asked for, and do not come
let holdLinesOfB = false;

// The lines of invoice B differ from those of A
jest.mock('./framework/graphql-client', () => {
    return {
        createGraphQLClient: jest.fn(() => ({
            request: jest.fn(async (document: string, variables: any) => {
                requests.push({ document, variables });
                const isB = JSON.stringify(variables.conditions).includes('"B"');
                if (isB && holdLinesOfB) return new Promise(() => undefined);
                return { invoiceLines: isB ? [{ id: 3, note: 'of B' }] : [{ id: 1, note: 'of A' }, { id: 2, note: 'of A' }] };
            })
        }))
    };
});

import App from './App';
import { waitUntil } from './test/waitUntil';

const linesOf = (invoiceId: string, rowExpansion?: View['rowExpansion']): View[] => [{
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
    filterGroups: [{ name: 'default', label: null, filters: [] }],
    ...(rowExpansion ? { rowExpansion } : {})
}];

const conditionsOf = (request: { variables: any } | undefined) => JSON.stringify(request?.variables.conditions);

function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = async (views: View[], onRowSelectionChange?: (rows: SimplifiedRow[]) => void) => {
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
                    rowSelection: onRowSelectionChange
                        ? { rowSelectionType: 'multiple', onRowSelectionChange }
                        : { rowSelectionType: 'none' }
                })
            }));
        });
    };
    const unmount = async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
    };
    return { container, render, unmount };
}

describe('App when the host changes what a view is read with', () => {
    beforeEach(() => {
        requests.length = 0;
        holdLinesOfB = false;
        localStorage.clear();
    });

    it('asks for the rows again, and tells the host the selected rows are gone', async () => {
        const { container, render, unmount } = mount();
        const onRowSelectionChange = jest.fn();
        const rowCheckboxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));

        await render(linesOf('A'), onRowSelectionChange);
        await waitUntil(() => (container.textContent ?? '').includes('line 2'), { description: 'the lines of invoice A' });
        expect(conditionsOf(requests.at(-1))).toContain('"A"');

        await act(async () => {
            rowCheckboxes()[0]?.click();
        });
        expect(onRowSelectionChange).toHaveBeenLastCalledWith([{ id: 1 }]);
        expect(rowCheckboxes().map(checkbox => checkbox.checked)).toEqual([true, false]);

        // The same view, built again: nothing to ask for
        const requestCount = requests.length;
        await render(linesOf('A'), onRowSelectionChange);
        expect(requests).toHaveLength(requestCount);

        await render(linesOf('B'), onRowSelectionChange);
        await waitUntil(() => (container.textContent ?? '').includes('line 3'), { description: 'the lines of invoice B' });

        expect(conditionsOf(requests.at(-1))).toContain('"B"');
        expect(container.textContent).not.toContain('line 1');
        expect(onRowSelectionChange).toHaveBeenLastCalledWith([]);
        expect(rowCheckboxes().some(checkbox => checkbox.checked)).toBe(false);

        await unmount();
    });

    it('expands a row on screen with the conditions it was fetched with, while the new rows load', async () => {
        const { container, render, unmount } = mount();
        const notes: View['rowExpansion'] = {
            lazy: true,
            mode: 'single',
            data: [{ type: 'valueQuery', field: 'note' }],
            render: ({ data }) => `note ${String(data.note)}`,
            canExpand: () => true
        };
        holdLinesOfB = true;

        await render(linesOf('A', notes));
        await waitUntil(() => (container.textContent ?? '').includes('line 2'), { description: 'the lines of invoice A' });

        await render(linesOf('B', notes));
        await waitUntil(() => requests.some(request => conditionsOf(request).includes('"B"')), { description: 'the lines of invoice B to be asked for' });

        // The lines of A are still on screen
        await act(async () => {
            container.querySelector<HTMLButtonElement>('tbody tr button')?.click();
        });
        await waitUntil(() => (container.textContent ?? '').includes('note of A'), { description: 'the note of line 1' });

        const expansion = requests.find(request => request.document.includes('note'));
        expect(conditionsOf(expansion)).toContain('"A"');
        expect(conditionsOf(expansion)).not.toContain('"B"');

        await unmount();
    });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

// Data requests stay pending until the test answers them, so both tables are waiting
// on the server at the same time.
const pending: { document: string; respond: () => void }[] = [];

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(({ document }: { document: string }) => new Promise(resolve => {
                const collectionName = document.includes('firstCollection') ? 'firstCollection' : 'secondCollection';
                pending.push({ document, respond: () => resolve({ [collectionName]: [{ id: `${collectionName}-row` }] }) });
            }))
        }))
    };
}, { virtual: true });

import App from './App';
import { waitUntil } from './test/waitUntil';

const viewsJson = (collectionName: string) => JSON.stringify([
    {
        title: collectionName,
        id: collectionName,
        source: { type: 'collection', collectionName },
        paginationKey: 'id',
        boolExpType: 'TestBoolExp',
        orderByType: '[TestOrderBy!]',
        columns: [{
            type: 'tableColumn',
            id: 'id',
            name: 'ID',
            data: [{ type: 'valueQuery', field: 'id' }],
            cellRenderer: { section: 'cellRenderers', key: 'text' }
        }],
        filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
    }
]);

const runtime = {
    cellRenderers: { text: ({ data }: { data: { id: string } }) => data.id },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {}
};

const renderTable = async (container: HTMLElement, collectionName: string) => {
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
                viewsJson: viewsJson(collectionName),
                externalRuntime: runtime as any,
                syncFilterStateToUrl: false
            })
        }));
    });
    return root;
};

describe('App with several tables on the page', () => {
    it('shows each table its own data when their requests overlap', async () => {
        localStorage.clear();
        const firstContainer = document.createElement('div');
        const secondContainer = document.createElement('div');
        document.body.append(firstContainer, secondContainer);

        const firstRoot = await renderTable(firstContainer, 'firstCollection');
        const secondRoot = await renderTable(secondContainer, 'secondCollection');
        await waitUntil(
            () => pending.some(r => r.document.includes('firstCollection')) && pending.some(r => r.document.includes('secondCollection')),
            { description: 'both tables to request their data' }
        );

        // The first table's response lands after the second table started its request.
        // A request tracker shared by every table used to discard it as superseded.
        await act(async () => {
            pending.forEach(request => request.respond());
        });

        await waitUntil(() => firstContainer.textContent?.includes('firstCollection-row') ?? false, { description: 'the first table\'s row' });
        await waitUntil(() => secondContainer.textContent?.includes('secondCollection-row') ?? false, { description: 'the second table\'s row' });
        expect(firstContainer.textContent).not.toContain('secondCollection-row');
        expect(secondContainer.textContent).not.toContain('firstCollection-row');

        await act(async () => {
            firstRoot.unmount();
            secondRoot.unmount();
        });
        firstContainer.remove();
        secondContainer.remove();
    });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

// Mock ESM-only graphql-request with a virtual CommonJS-compatible stub BEFORE importing App.
jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

import App from './App';

jest.mock('./framework/data', () => {
    return {
        fetchData: jest.fn(async () => ({ rows: [] as Record<string, unknown>[], flattenedRows: [] as any[] }))
    };
});

describe('App action button disabled while running', () => {
    it('disables and re-enables async action button', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const asyncAction = jest.fn(async () => {
            // Simulate async work
            await new Promise(r => setTimeout(r, 10));
        });

        const viewsJson = JSON.stringify([
            {
                title: 'Test View',
                id: 'test-view',
                collectionName: 'testCollection',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                columns: [
                    { type: 'tableColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }], name: 'ID', cellRenderer: { section: 'cellRenderers', key: 'text' } }
                ],
                filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
            }
        ]);

        const runtime = { cellRenderers: { text: () => 'cell' }, queryTransforms: {}, noRowsComponents: {}, customFilterComponents: {}, initialValues: {} };

        // Provide children explicitly to satisfy PrimeReactProvider props typing.
        const appElement = React.createElement(App, {
            graphqlHost: 'http://example.com/graphql',
            graphqlToken: 'token',
            geminiApiKey: 'gemini',
            showViewsMenu: false,
            showViewTitle: false,
            viewsJson,
            externalRuntime: runtime as any,
            syncFilterStateToUrl: false,
            actions: [{ label: 'Async Action', onClick: asyncAction }]
        });
        createRoot(container).render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElement })
        );

        // Allow initial effects / state propagation + async fetchData mock
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 20));

        const button = container.querySelector('[data-testid="dtv-action-0"]') as HTMLButtonElement | null;
        if (!button) throw new Error('Async Action button not found');
        expect(button.disabled).toBe(false);

        // Click triggers async
        button.click();
        expect(asyncAction).toHaveBeenCalledTimes(1);
        // Wait a microtask for runningActions state to commit
        await new Promise(r => setTimeout(r, 0));
        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('Async Action...');

        // Wait for async to finish
        await new Promise(r => setTimeout(r, 20));
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Async Action');
    });
});

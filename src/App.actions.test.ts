/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
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
    async function waitUntil(predicate: () => boolean, { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number }): Promise<void> {
        const start = Date.now();
        while (true) {
            if (predicate()) return;
            if (Date.now() - start > timeoutMs) {
                throw new Error('Timed out waiting for condition');
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
    }

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
        const root = createRoot(container);

        await act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, { value: {}, children: appElement })
            );
        });

        // Allow initial effects / state propagation + async fetchData mock
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 20));

        const button = container.querySelector('[data-testid="dtv-action-0"]') as HTMLButtonElement | null;
        if (!button) throw new Error('Async Action button not found');
        expect(button.disabled).toBe(false);

        // Click triggers async
        await act(async () => {
            button.click();
            await new Promise(r => setTimeout(r, 0));
        });
        expect(asyncAction).toHaveBeenCalledTimes(1);
        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('Async Action...');

        const actionPromise = asyncAction.mock.results[0]?.value;
        if (!(actionPromise instanceof Promise)) {
            throw new Error('Expected async action promise');
        }

        await act(async () => {
            await actionPromise;
        });

        await waitUntil(() => button.disabled === false, { timeoutMs: 500, intervalMs: 5 });
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Async Action');

        await act(async () => {
            root.unmount();
        });
    });
});

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

jest.mock('./framework/data', () => {
    return {
        fetchData: jest.fn(async () => ({ rows: [] as Record<string, unknown>[], flattenedRows: [] as any[] }))
    };
});

import App, { DTVAPI } from './App';

describe('DTVAPI row selection', () => {
    it('exposes rowSelection.reset() on the unified apiRef', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        async function waitFor(condition: () => boolean, args?: { timeoutMs?: number; intervalMs?: number }) {
            const timeoutMs = args?.timeoutMs ?? 1000;
            const intervalMs = args?.intervalMs ?? 10;
            const start = Date.now();

            while (Date.now() - start < timeoutMs) {
                if (condition()) {
                    return;
                }
                await new Promise(r => setTimeout(r, intervalMs));
            }

            throw new Error('Timed out waiting for condition');
        }

        const apiRef = React.createRef<DTVAPI | null>();

        const viewsJson = JSON.stringify([
            {
                title: 'Test View',
                id: 'test-view',
                collectionName: 'testCollection',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                columns: [
                    {
                        type: 'tableColumn',
                        id: 'id',
                        data: [{ type: 'valueQuery', field: 'id' }],
                        name: 'ID',
                        cellRenderer: { section: 'cellRenderers', key: 'text' }
                    }
                ],
                filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
            }
        ]);

        const runtime = {
            cellRenderers: { text: () => 'cell' },
            queryTransforms: {},
            noRowsComponents: {},
            customFilterComponents: {},
            initialValues: {}
        };

        const appElement = React.createElement(App, {
            graphqlHost: 'http://example.com/graphql',
            graphqlToken: 'token',
            geminiApiKey: 'gemini',
            showViewsMenu: false,
            showViewTitle: false,
            viewsJson,
            externalRuntime: runtime as any,
            syncFilterStateToUrl: false,
            apiRef,
            rowSelection: {
                rowSelectionType: 'multiple'
            }
        });

        createRoot(container).render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElement })
        );

        await waitFor(() => apiRef.current !== null);

        expect(apiRef.current).not.toBeNull();
        expect(typeof apiRef.current?.rowSelection?.reset).toBe('function');

        // Should be safe to call even if nothing is selected.
        apiRef.current?.rowSelection.reset();
    });
});

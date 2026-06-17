/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

function buildFetchDataResult() {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: 20 - i }));
    const flattenedRows = rows.map(r => ({ id: { id: r.id } }));
    return { rows, flattenedRows } as any;
}

const graphqlRequestMock = jest.fn(async () => ({}));

// Mock ESM-only graphql-request with a virtual CommonJS-compatible stub BEFORE importing App.
jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: (...args: any[]) => (graphqlRequestMock as any)(...args)
        }))
    };
}, { virtual: true });

const fetchDataMock = jest.fn(async () => buildFetchDataResult());
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return {
        ...actual,
        fetchData: (...args: any[]) => (fetchDataMock as any)(...args)
    };
});

import App, { DTVAPI } from './App';

async function waitFor<T, U extends T>(
    getValue: () => T,
    predicate: (value: T) => value is U,
    timeoutMs?: number
): Promise<U>;
async function waitFor<T>(
    getValue: () => T,
    predicate: (value: T) => boolean,
    timeoutMs?: number
): Promise<T>;
async function waitFor<T>(getValue: () => T, predicate: (value: T) => boolean, timeoutMs = 500) {
    const start = Date.now();
    while (true) {
        const value = getValue();
        if (predicate(value)) return value;
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(value)}`);
        }
        await new Promise(r => setTimeout(r, 10));
    }
}

describe('App apiRef', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchDataMock.mockReset();
        fetchDataMock.mockImplementation(async () => buildFetchDataResult());
        graphqlRequestMock.mockReset();
        graphqlRequestMock.mockImplementation(async () => ({}));
    });

    it('exposes fetchData() that triggers fetchData again', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const apiRef = React.createRef<DTVAPI | null>();

        const viewsJson = JSON.stringify([
            {
                title: 'Test View',
                id: 'test-view',
                source: { type: 'collection', collectionName: 'testCollection' },
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
            apiRef
        });

        const root = createRoot(container);

        await act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, { value: {}, children: appElement })
            );
        });

        // Allow initial effect-driven fetch + render.
        await waitFor(
            () => (fetchDataMock as any).mock.calls.length,
            (count) => count >= 1
        );

        // Initial pagination shows first page.
        const page = () => container.querySelector('[data-testid="pagination-page"]') as HTMLElement | null;
        const pageText = () => page()?.textContent ?? null;
        await waitFor(page, (el): el is HTMLElement => el !== null);
        await waitFor(
            pageText,
            (text) => text === '1-20'
        );

        // Navigate to next page (should use last row cursor).
        const next = container.querySelector('[data-testid="pagination-next"]') as HTMLButtonElement | null;
        if (!next) throw new Error('pagination-next button not found');
        await act(async () => {
            next.click();
        });
        await waitFor(
            () => (fetchDataMock as any).mock.calls.length,
            (count) => count >= 2
        );
        await waitFor(
            pageText,
            (text) => text === '21-40'
        );

        // apiRef fetchData triggers the same first-page fetch (cursor=null) without resetting pagination.
        if (!apiRef.current) throw new Error('apiRef.current was not set');
        await act(async () => {
            apiRef.current?.fetchData();
        });
        await waitFor(
            () => (fetchDataMock as any).mock.calls.length,
            (count) => count >= 3
        );

        const calls = (fetchDataMock as any).mock.calls as any[];
        const lastCallArg = calls[2]?.[0];
        if (!lastCallArg) throw new Error('Expected fetchData third call arg');
        expect(lastCallArg.cursor).toBe(null);
        await waitFor(
            pageText,
            (text) => text === '21-40'
        );

        await act(async () => {
            root.unmount();
        });
    });

    it('exposes rowExpansion controls when a view defines rowExpansion', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const apiRef = React.createRef<DTVAPI | null>();

        const viewsJson = JSON.stringify([
            {
                title: 'Test View',
                id: 'test-view',
                source: { type: 'collection', collectionName: 'testCollection' },
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
                rowExpansion: {
                    runtime: { section: 'rowExpansions', key: 'details' },
                    mode: 'multiple',
                    data: [{ type: 'valueQuery', field: 'id' }]
                },
                filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
            }
        ]);

        const runtime = {
            cellRenderers: { text: () => 'cell' },
            queryTransforms: {},
            noRowsComponents: {},
            rowExpansions: {
                details: { render: () => 'details', canExpand: () => true }
            },
            customFilterComponents: {},
            initialValues: {},
            suggestionFetchers: {}
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
            apiRef
        });

        const root = createRoot(container);

        await act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, { value: {}, children: appElement })
            );
        });

        const resolvedApi = await waitFor(
            () => apiRef.current,
            (value): value is DTVAPI => value !== null
        );

        expect(typeof resolvedApi.rowExpansion.reset).toBe('function');
        expect(typeof resolvedApi.rowExpansion.collapseAll).toBe('function');
        expect(typeof resolvedApi.rowExpansion.expandAll).toBe('function');

        await act(async () => {
            resolvedApi.rowExpansion.expandAll();
            resolvedApi.rowExpansion.collapseAll();
            resolvedApi.rowExpansion.reset();
        });

        await act(async () => {
            root.unmount();
        });
    });

    it('lazy rowExpansion excludes expansion data from the initial table query', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        fetchDataMock.mockImplementation(async (args?: { query?: string }) => {
            expect(args?.query).not.toContain('details');
            return {
                rows: [{ id: 1 }],
                flattenedRows: [{ id: { id: 1 } }]
            } as any;
        });

        const viewsJson = JSON.stringify([
            {
                title: 'Test View',
                id: 'test-view',
                source: { type: 'collection', collectionName: 'testCollection' },
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
                rowExpansion: {
                    runtime: { section: 'rowExpansions', key: 'details' },
                    mode: 'multiple',
                    lazy: true,
                    data: [
                        {
                            type: 'objectQuery',
                            field: 'details',
                            selectionSet: [{ type: 'valueQuery', field: 'note' }]
                        }
                    ]
                },
                filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
            }
        ]);

        const runtime = {
            cellRenderers: { text: ({ data }: any) => data.id },
            queryTransforms: {},
            noRowsComponents: {},
            rowExpansions: {
                details: {
                    render: ({ data }: any) => data.details?.note ?? 'missing',
                    canExpand: ({ row }: any) => Boolean(row.id)
                }
            },
            customFilterComponents: {},
            initialValues: {},
            suggestionFetchers: {}
        };

        const root = createRoot(container);
        await act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, {
                    value: {},
                    children: React.createElement(App, {
                        graphqlHost: 'http://example.com/graphql',
                        graphqlToken: 'token',
                        geminiApiKey: 'gemini',
                        showViewsMenu: false,
                        showViewTitle: false,
                        viewsJson,
                        externalRuntime: runtime as any,
                        syncFilterStateToUrl: false,
                    })
                })
            );
        });

        await waitFor(
            () => (fetchDataMock as any).mock.calls.length,
            (count) => count >= 1
        );

        const firstCallArg = (fetchDataMock as any).mock.calls[0]?.[0] as { query?: string } | undefined;
        expect(firstCallArg?.query).toBeDefined();
        expect(firstCallArg?.query).not.toContain('details');

        await act(async () => {
            root.unmount();
        });
    });
});

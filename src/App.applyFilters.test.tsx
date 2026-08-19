/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import type { View } from './framework/view';
import type { CellRenderer } from './framework/column-definition';
import * as FilterValue from './framework/filterValue';

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

type FetchDataArgs = { filterState: Map<string, unknown> };
type FetchDataResult = { rows: Record<string, unknown>[]; flattenedRows: any[] };
// Typed with the args so assertions can read back the `filterState` each fetch ran with.
const fetchDataMock = jest.fn<(args: FetchDataArgs) => Promise<FetchDataResult>>(async () => ({ rows: [], flattenedRows: [] }));

jest.mock('./framework/data', () => {
    return {
        fetchData: fetchDataMock,
        resolveHeadersMiddleware: () => (request: unknown) => request,
        getPaginationOrderFieldQueries: jest.fn(() => [])
    };
});

import App from './App';

// A cell renderer that mirrors the documented `updateFilterById` + `applyFilters`
// pairing: the first call only writes the draft filter state, the second has to
// promote that draft to the applied state and refetch.
const filterByEmailCellRenderer: CellRenderer = ({ updateFilterById, applyFilters, createElement }) =>
    createElement('button', {
        onClick: () => {
            updateFilterById('email', currentFilter => ({
                ...currentFilter,
                value: FilterValue.value('clicked@example.com')
            }));
            applyFilters();
        }
    }, 'Filter by email');

describe('App applyFilters', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    function createView(initialValue: string): View {
        return {
            title: 'Provided View',
            id: 'provided-view',
            source: { type: 'collection', collectionName: 'testCollection' },
            paginationKey: 'id',
            boolExpType: 'TestBoolExp',
            orderByType: '[TestOrderBy!]',
            columnDefinitions: [
                {
                    type: 'tableColumn',
                    id: 'id',
                    name: 'ID',
                    data: [{ type: 'valueQuery', field: 'id' }],
                    cellRenderer: filterByEmailCellRenderer
                }
            ],
            filterGroups: [
                {
                    name: 'default',
                    label: null,
                    filters: [
                        {
                            id: 'email',
                            label: 'Email',
                            aiGenerated: false,
                            expression: {
                                type: 'equals',
                                field: 'email',
                                value: {
                                    type: 'text',
                                    label: 'Email',
                                    initialValue
                                }
                            }
                        }
                    ]
                }
            ]
        };
    }

    function getButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
        const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent?.trim() === label) as HTMLButtonElement | undefined;
        if (!button) {
            throw new Error(`Button not found: ${label}`);
        }
        return button;
    }

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

    async function renderApp(initialValue: string, rows: Record<string, unknown>[]) {
        fetchDataMock.mockClear();
        fetchDataMock.mockImplementation(async () => ({ rows, flattenedRows: rows as any[] }));

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <PrimeReactProvider value={{}}>
                    <App
                        graphqlHost="http://example.com/graphql"
                        requestHeaders={{ Authorization: 'Bearer token' }}
                        geminiApiKey="gemini"
                        showViewsMenu={false}
                        showViewTitle={false}
                        views={[createView(initialValue)]}
                        syncFilterStateToUrl={false}
                    />
                </PrimeReactProvider>
            );
        });

        await waitUntil(() => !container.textContent?.includes('Loading data…'), { timeoutMs: 1000, intervalMs: 10 });
        return container;
    }

    it('applies the filter written by a cell renderer and refetches with it', async () => {
        const container = await renderApp('jane@example.com', [{ id: 1 }]);

        expect(container.textContent || '').toContain('email = jane@example.com');
        const initialFetchCallCount = fetchDataMock.mock.calls.length;

        await act(async () => {
            getButtonByText(container, 'Filter by email').click();
        });

        await waitUntil(() => (container.textContent || '').includes('email = clicked@example.com'), { timeoutMs: 1000, intervalMs: 10 });
        expect(fetchDataMock.mock.calls.length).toBeGreaterThan(initialFetchCallCount);

        // The refetch must carry the new value, not the previously applied one —
        // a bare `triggerRefetch` would query with `jane@example.com`.
        const lastCall = fetchDataMock.mock.calls[fetchDataMock.mock.calls.length - 1];
        expect(JSON.stringify(Array.from(lastCall[0].filterState))).toContain('clicked@example.com');
    });

    it('applies the cleared state and refetches when Reset All is pressed', async () => {
        const container = await renderApp('jane@example.com', [{ id: 1 }]);

        expect(container.textContent || '').toContain('email = jane@example.com');

        await act(async () => {
            getButtonByText(container, 'Filters').click();
        });

        const initialFetchCallCount = fetchDataMock.mock.calls.length;

        await act(async () => {
            getButtonByText(container, 'Reset All').click();
        });

        await waitUntil(() => !(container.textContent || '').includes('email = jane@example.com'), { timeoutMs: 1000, intervalMs: 10 });
        expect(fetchDataMock.mock.calls.length).toBeGreaterThan(initialFetchCallCount);

        const lastCall = fetchDataMock.mock.calls[fetchDataMock.mock.calls.length - 1];
        expect(JSON.stringify(Array.from(lastCall[0].filterState))).not.toContain('jane@example.com');
    });
});

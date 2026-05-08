/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import type { View } from './framework/view';

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

const fetchDataMock = jest.fn(async () => ({ rows: [] as Record<string, unknown>[], flattenedRows: [] as any[] }));

jest.mock('./framework/data', () => {
    return {
        fetchData: fetchDataMock
    };
});

import App from './App';

describe('App collapsed filter panel summary', () => {
    function createView(initialValue = 'jane@example.com'): View {
        return {
            title: 'Provided View',
            id: 'provided-view',
            collectionName: 'testCollection',
            paginationKey: 'id',
            boolExpType: 'TestBoolExp',
            orderByType: '[TestOrderBy!]',
            columnDefinitions: [
                {
                    type: 'tableColumn',
                    id: 'id',
                    name: 'ID',
                    data: [{ type: 'valueQuery', field: 'id' }],
                    cellRenderer: () => 'cell'
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

    it('shows removable applied filters below the menubar when the filter panel is hidden', async () => {
        fetchDataMock.mockClear();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const views: View[] = [createView()];

        await act(async () => {
            root.render(
                <PrimeReactProvider value={{}}>
                    <App
                        graphqlHost="http://example.com/graphql"
                        graphqlToken="token"
                        geminiApiKey="gemini"
                        showViewsMenu={false}
                        showViewTitle={false}
                        views={views}
                        syncFilterStateToUrl={false}
                    />
                </PrimeReactProvider>
            );
        });

        await waitUntil(() => !container.textContent?.includes('Loading data…'), { timeoutMs: 1000, intervalMs: 10 });
        expect(container.textContent || '').toContain('email = jane@example.com');

        const filterToggleButton = getButtonByText(container, 'Filters');
        expect(filterToggleButton.textContent).toContain('Filters');

        const resetButton = container.querySelector('button[aria-label="Reset filter email"]') as HTMLButtonElement | null;
        expect(resetButton).not.toBeNull();

        const initialFetchCallCount = fetchDataMock.mock.calls.length;

        await act(async () => {
            resetButton?.click();
        });

        await waitUntil(() => !(container.textContent || '').includes('email = jane@example.com'), { timeoutMs: 1000, intervalMs: 10 });
        expect(fetchDataMock.mock.calls.length).toBeGreaterThan(initialFetchCallCount);
    });

    it('keeps showing the last applied filters until apply is pressed', async () => {
        fetchDataMock.mockClear();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <PrimeReactProvider value={{}}>
                    <App
                        graphqlHost="http://example.com/graphql"
                        graphqlToken="token"
                        geminiApiKey="gemini"
                        showViewsMenu={false}
                        showViewTitle={false}
                        views={[createView()]}
                        syncFilterStateToUrl={false}
                    />
                </PrimeReactProvider>
            );
        });

        await waitUntil(() => !container.textContent?.includes('Loading data…'), { timeoutMs: 1000, intervalMs: 10 });
        expect(container.textContent || '').toContain('email = jane@example.com');

        const initialFetchCallCount = fetchDataMock.mock.calls.length;

        await act(async () => {
            getButtonByText(container, 'Filters').click();
        });

        const emailInput = Array.from(container.querySelectorAll('input')).find(input => (input as HTMLInputElement).value === 'jane@example.com') as HTMLInputElement | undefined;
        expect(emailInput).toBeDefined();

        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (!valueSetter || !emailInput) {
            throw new Error('Email input setter not available');
        }

        await act(async () => {
            valueSetter.call(emailInput, 'bob@example.com');
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            getButtonByText(container, 'Hide Filters').click();
        });

        expect(container.textContent || '').toContain('email = jane@example.com');
        expect(container.textContent || '').not.toContain('email = bob@example.com');
        expect(fetchDataMock.mock.calls.length).toBe(initialFetchCallCount);

        await act(async () => {
            getButtonByText(container, 'Filters').click();
        });

        expect(Array.from(container.querySelectorAll('input')).some(input => (input as HTMLInputElement).value === 'bob@example.com')).toBe(true);

        await act(async () => {
            getButtonByText(container, 'Apply filter').click();
        });

        await act(async () => {
            getButtonByText(container, 'Hide Filters').click();
        });

        await waitUntil(() => (container.textContent || '').includes('email = bob@example.com'), { timeoutMs: 1000, intervalMs: 10 });
        expect(fetchDataMock.mock.calls.length).toBeGreaterThan(initialFetchCallCount);
    });

    it('reset all clears the applied filters immediately', async () => {
        fetchDataMock.mockClear();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <PrimeReactProvider value={{}}>
                    <App
                        graphqlHost="http://example.com/graphql"
                        graphqlToken="token"
                        geminiApiKey="gemini"
                        showViewsMenu={false}
                        showViewTitle={false}
                        views={[createView()]}
                        syncFilterStateToUrl={false}
                    />
                </PrimeReactProvider>
            );
        });

        await waitUntil(() => !container.textContent?.includes('Loading data…'), { timeoutMs: 1000, intervalMs: 10 });
        expect(container.textContent || '').toContain('email = jane@example.com');

        const initialFetchCallCount = fetchDataMock.mock.calls.length;

        await act(async () => {
            getButtonByText(container, 'Filters').click();
        });

        await act(async () => {
            getButtonByText(container, 'Reset All').click();
        });

        await act(async () => {
            getButtonByText(container, 'Hide Filters').click();
        });

        await waitUntil(() => !(container.textContent || '').includes('email = jane@example.com'), { timeoutMs: 1000, intervalMs: 10 });
        expect(fetchDataMock.mock.calls.length).toBeGreaterThan(initialFetchCallCount);
    });
});

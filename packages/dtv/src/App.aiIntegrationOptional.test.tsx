/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
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
        fetchData: fetchDataMock,
        resolveHeadersMiddleware: () => (request: unknown) => request,
        getPaginationOrderFieldQueries: jest.fn(() => [])
    };
});

import App from './App';

describe('App AI Filter Assistant availability', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    function createView(): View {
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
                                    initialValue: ''
                                }
                            }
                        }
                    ]
                }
            ]
        };
    }

    function findAiButton(container: HTMLElement): HTMLButtonElement | undefined {
        return Array.from(container.querySelectorAll('button'))
            .find(candidate => candidate.textContent?.trim() === 'AI Filter Assistant') as HTMLButtonElement | undefined;
    }

    async function renderApp(withAiIntegration: boolean): Promise<HTMLElement> {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <PrimeReactProvider value={{}}>
                    <App
                        graphqlHost="http://example.com/graphql"
                        requestHeaders={{ Authorization: 'Bearer token' }}
                        {...(withAiIntegration
                            ? { aiIntegration: { type: 'builtInGemini' as const, geminiApiKey: 'gemini' } }
                            : {})}
                        showViewsMenu={false}
                        showViewTitle={false}
                        views={[createView()]}
                        syncFilterStateToUrl={false}
                    />
                </PrimeReactProvider>
            );
        });

        return container;
    }

    it('offers the AI Filter Assistant when an aiIntegration is passed', async () => {
        const container = await renderApp(true);
        expect(findAiButton(container)).toBeDefined();
    });

    it('does not offer the AI Filter Assistant when aiIntegration is omitted', async () => {
        const container = await renderApp(false);
        expect(findAiButton(container)).toBeUndefined();
    });
});

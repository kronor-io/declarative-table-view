/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({ testCollection: [] }))
        }))
    };
}, { virtual: true });

jest.mock('../framework/data', () => {
    return {
        fetchData: jest.fn(async () => ({ rows: [] as Record<string, unknown>[], flattenedRows: [] as any[] })),
        resolveHeadersMiddleware: () => (request: unknown) => request,
        buildGraphQLQueryVariables: jest.fn((view: any, _filterState: any, rowLimit: number, cursor: any) => ({
            conditions: {},
            paginationCondition: cursor !== null ? { [view.paginationKey]: { _lt: cursor } } : {},
            rowLimit,
            orderBy: [{ [view.paginationKey]: 'DESC' }]
        })),
        getPaginationOrderFieldQueries: jest.fn(() => [])
    };
});

import App from '../App';
import { waitUntil } from '../test/waitUntil';
import { REVISION_2026_03_26 } from '../framework/user-data';
import { getViewRootFieldName } from '../framework/view';

let capturedAst: any = null;
let capturedAliasedAst: any = null;
let capturedQuery: string | null = null;
let capturedVariables: any = null;
let capturedPagination: any = null;
let capturedRowsPerPage: number | null = null;
let capturedUserData: any = null;
let capturedOrdering: any = null;

const action = {
    label: 'Capture AST',
    onClick: (api: any) => {
        capturedAst = api.generateGraphQLQueryAST(
            getViewRootFieldName(api.view),
            api.view.columnDefinitions,
            api.view.boolExpType,
            api.view.orderByType,
            api.view.paginationKey
        );
        capturedAliasedAst = api.generateColumnAliasedGraphQLQueryAST(
            getViewRootFieldName(api.view),
            api.view.columnDefinitions,
            api.view.boolExpType,
            api.view.orderByType,
            api.view.paginationKey
        );
        capturedQuery = api.renderGraphQLQuery(capturedAst);
        capturedVariables = api.buildGraphQLQueryVariables(api.view, api.filterState, 5, null);
        capturedPagination = api.getPaginationState();
        capturedRowsPerPage = api.rowsPerPage;
        capturedOrdering = api.ordering;
    }
};

const idColumn = { type: 'tableColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }], name: 'ID', cellRenderer: { section: 'cellRenderers', key: 'text' } };

const buildViewsJson = (columns: unknown[] = [idColumn]) => JSON.stringify([
    {
        title: 'Test View',
        id: 'test-view',
        source: { type: 'collection', collectionName: 'testCollection' },
        paginationKey: 'id',
        boolExpType: 'TestBoolExp',
        orderByType: '[TestOrderBy!]',
        columns,
        filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
    }
]);

// Mounts App with the given actions and waits for its action buttons to render.
async function renderApp({ actions, columns }: { actions: unknown[]; columns?: unknown[] }) {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const runtime = { cellRenderers: { text: () => 'cell' }, queryTransforms: {}, noRowsComponents: {}, customFilterComponents: {}, initialValues: {} };

    const appElement = React.createElement(App, {
        graphqlHost: 'http://example.com/graphql',
        requestHeaders: { Authorization: 'Bearer token' },
        aiIntegration: { type: 'builtInGemini' as const, geminiApiKey: 'gemini' },
        showViewsMenu: false,
        showViewTitle: false,
        viewsJson: buildViewsJson(columns),
        externalRuntime: runtime as any,
        syncFilterStateToUrl: false,
        actions: actions as any
    });

    const root = createRoot(container);

    await act(async () => {
        root.render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElement })
        );
    });

    await waitUntil(() => container.querySelector('[data-testid="dtv-action-0"]') !== null, { description: 'the action buttons to render' });

    return {
        container,
        unmount: async () => {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        }
    };
}

async function clickAction(container: HTMLElement, index = 0) {
    const btn = container.querySelector(`[data-testid="dtv-action-${index}"]`) as HTMLButtonElement | null;
    if (!btn) throw new Error(`Action button ${index} not found`);
    await act(async () => {
        btn.click();
    });
}

async function sortByColumn(container: HTMLElement, header: string) {
    const th = Array.from(container.querySelectorAll('th.p-sortable-column'))
        .find(element => element.textContent?.includes(header)) as HTMLElement | undefined;
    if (!th) throw new Error(`Sortable column header "${header}" not found`);
    // Compare against the pre-click value: this helper is also used to re-sort an
    // already-sorted column, where "is sorted at all" would already be true.
    const sortBeforeClick = th.getAttribute('aria-sort');
    await act(async () => {
        th.click();
    });
    await waitUntil(() => th.getAttribute('aria-sort') !== sortBeforeClick, { description: `the "${header}" column's sort state to change` });
}

describe('ActionAPI GraphQL helpers', () => {
    beforeEach(() => {
        capturedAst = null;
        capturedAliasedAst = null;
        capturedQuery = null;
        capturedVariables = null;
        capturedPagination = null;
        capturedRowsPerPage = null;
        capturedUserData = null;
        capturedOrdering = null;
        localStorage.clear();
    });

    it('provides both GraphQL AST helpers and the variable builder to actions', async () => {
        const { container, unmount } = await renderApp({ actions: [action] });

        await clickAction(container);

        expect(capturedAst).toBeTruthy();
        expect(capturedAst.rootField.field).toContain('testCollection');
        expect(capturedAliasedAst).toBeTruthy();
        expect(capturedAliasedAst.rootField.field).toContain('testCollection');
        expect(capturedQuery).toBeTruthy();
        expect(capturedQuery).toContain('testCollection');
        expect(capturedVariables).toBeTruthy();
        expect(capturedVariables).toHaveProperty('conditions');
        expect(capturedVariables).toHaveProperty('paginationCondition');
        expect(capturedVariables).toHaveProperty('orderBy');
        expect(capturedPagination).toBeTruthy();
        expect(capturedPagination).toHaveProperty('page');
        expect(capturedPagination).toHaveProperty('cursors');
        expect(capturedRowsPerPage).toBe(20); // default from App rowsPerPage prop
        expect(capturedOrdering).toBeNull(); // nothing sorted yet

        await unmount();
    });

    it('exposes current user preferences and view data to actions', async () => {
        localStorage.setItem('dtvUserData', JSON.stringify({
            preferences: {
                syncFilterStateToUrlOverride: true,
                closeFilterPanelOnApply: false
            },
            views: {
                'test-view': {
                    columnOrder: ['id'],
                    hiddenColumns: ['id'],
                    rowsPerPage: 50,
                    savedFilters: []
                }
            },
            revision: 1,
            formatRevision: REVISION_2026_03_26
        }));

        const captureUserDataAction = {
            label: 'Capture user data',
            onClick: (api: any) => {
                capturedUserData = {
                    preferences: api.userData.preferences,
                    viewData: api.userData.viewData
                };
            }
        };

        const { container, unmount } = await renderApp({ actions: [captureUserDataAction] });

        await clickAction(container);

        expect(capturedUserData).toEqual({
            preferences: { syncFilterStateToUrlOverride: true, closeFilterPanelOnApply: false },
            viewData: {
                columnOrder: ['id'],
                hiddenColumns: ['id'],
                persistedFilterState: null,
                rowsPerPage: 50,
                savedFilters: [],
                syncFilterStateToUserData: true
            },
        });

        await unmount();
    });

    it('exposes the ordering the table is sorted by to actions', async () => {
        // The sorted column is deliberately neither the pagination key nor named after
        // its own field: the action must see the field path the user sorted by
        // ("createdAt"), not the pagination key ("id") and not the column id ("created").
        const createdColumn = { type: 'tableColumn', id: 'created', data: [{ type: 'valueQuery', field: 'createdAt' }], name: 'Created', cellRenderer: { section: 'cellRenderers', key: 'text' } };
        const { container, unmount } = await renderApp({ actions: [action], columns: [idColumn, createdColumn] });

        await sortByColumn(container, 'Created');
        await clickAction(container);

        expect(capturedOrdering).toEqual({ field: 'createdAt', direction: 'ASC' });

        // Sorting the same column again flips the direction the action sees.
        await sortByColumn(container, 'Created');
        await clickAction(container);

        expect(capturedOrdering).toEqual({ field: 'createdAt', direction: 'DESC' });

        await unmount();
    });
});

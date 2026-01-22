/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
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
        buildGraphQLQueryVariables: jest.fn((view: any, _filterState: any, rowLimit: number, cursor: any) => ({
            conditions: {},
            paginationCondition: cursor !== null ? { [view.paginationKey]: { _lt: cursor } } : {},
            rowLimit,
            orderBy: [{ [view.paginationKey]: 'DESC' }]
        }))
    };
});

import App from '../App';

let capturedAst: any = null;
let capturedQuery: string | null = null;
let capturedVariables: any = null;
let capturedPagination: any = null;
let capturedRowsPerPage: number | null = null;

const action = {
    label: 'Capture AST',
    onClick: (api: any) => {
        capturedAst = api.generateGraphQLQueryAST(
            api.view.collectionName,
            api.view.columnDefinitions,
            api.view.boolExpType,
            api.view.orderByType,
            api.view.paginationKey
        );
        capturedQuery = api.renderGraphQLQuery(capturedAst);
        capturedVariables = api.buildGraphQLQueryVariables(api.view, api.filterState, 5, null);
        capturedPagination = api.getPaginationState();
        capturedRowsPerPage = api.rowsPerPage;
    }
};

describe('ActionAPI GraphQL helpers', () => {
    it('provides GraphQL helpers and variable builder to actions', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

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

        const appElement = React.createElement(App, {
            graphqlHost: 'http://example.com/graphql',
            graphqlToken: 'token',
            geminiApiKey: 'gemini',
            showViewsMenu: false,
            showViewTitle: false,
            viewsJson,
            externalRuntime: runtime as any,
            syncFilterStateToUrl: false,
            actions: [action]
        });

        createRoot(container).render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElement })
        );

        await new Promise(r => setTimeout(r, 25));
        const btn = container.querySelector('[data-testid="dtv-action-0"]') as HTMLButtonElement | null;
        if (!btn) throw new Error('Action button not found');
        btn.click();
        await new Promise(r => setTimeout(r, 0));

        expect(capturedAst).toBeTruthy();
        expect(capturedAst.rootField).toContain('testCollection');
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
    });
});

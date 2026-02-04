/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import type { View } from './framework/view';

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

jest.mock('./framework/view-parser', () => {
    return {
        parseViewJson: jest.fn(() => {
            throw new Error('parseViewJson should not be called when App.views is provided');
        })
    };
});

import { parseViewJson } from './framework/view-parser';
import App from './App';

describe('App views prop', () => {
    it('bypasses view JSON parsing when views are provided', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const views: View[] = [
            {
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
                filterSchema: {
                    groups: [{ name: 'default', label: null }],
                    filters: []
                }
            }
        ];

        const appElement = React.createElement(App, {
            graphqlHost: 'http://example.com/graphql',
            graphqlToken: 'token',
            geminiApiKey: 'gemini',
            showViewsMenu: false,
            showViewTitle: false,
            views,
            syncFilterStateToUrl: false
        });

        root.render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElement })
        );

        await new Promise(r => setTimeout(r, 25));

        expect(parseViewJson).not.toHaveBeenCalled();

        // Basic smoke check: view title is rendered somewhere when showViewTitle is true
        const appElementWithTitle = React.createElement(App, {
            graphqlHost: 'http://example.com/graphql',
            graphqlToken: 'token',
            geminiApiKey: 'gemini',
            showViewsMenu: false,
            showViewTitle: true,
            views,
            syncFilterStateToUrl: false
        });
        root.render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElementWithTitle })
        );
        await new Promise(r => setTimeout(r, 25));
        expect(container.textContent || '').toContain('Provided View');
    });
});

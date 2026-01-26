/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import App from './App';
import { USER_DATA_LOCALSTORAGE_KEY } from './framework/user-data-manager';
import { failure } from './framework/result';

// Mock ESM-only graphql-request with a virtual CommonJS-compatible stub BEFORE importing App internals.
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

describe('Remote save failure shows warning toast and persists locally', () => {
    it('shows warn toast when onSave rejects, and data is saved locally', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        // Ensure crypto.randomUUID exists for SavedFilter id
        (global as any).crypto = (global as any).crypto || {};
        (global as any).crypto.randomUUID = jest.fn(() => 'test-id');

        // Mock prompt to provide a filter name
        const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('My Filter');

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
            userData: {
                onSave: jest.fn(async () => failure('Simulated remote failure'))
            }
        });

        createRoot(container).render(
            React.createElement(PrimeReactProvider, { value: {}, children: appElement })
        );

        // Allow initial effects / state propagation + async fetchData mock
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 20));

        // Open Filters panel
        const filtersButton = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Filters')) as HTMLButtonElement | undefined;
        expect(filtersButton).toBeDefined();
        filtersButton!.click();
        // Wait for the filter form to render after toggling
        await new Promise(r => setTimeout(r, 20));

        // Click "Save Filter"
        const saveButton = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Filter')) as HTMLButtonElement | undefined;
        expect(saveButton).toBeDefined();
        saveButton!.click();

        // Wait for async handlers
        await new Promise(r => setTimeout(r, 20));

        // Expect warning toast rendered with external save failure message
        const toastMessage = Array.from(container.querySelectorAll('.p-toast-message-text')).find(el => {
            const text = el.textContent || ''
            return text.includes('External Save Failed') || text.includes('Simulated remote failure')
        });
        expect(toastMessage).toBeDefined();

        // Verify local persistence
        const raw = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY);
        expect(raw).toBeTruthy();
        const json = raw ? JSON.parse(raw) : null;
        expect(json).toBeTruthy();
        expect(json.views['test-view'].savedFilters.length).toBeGreaterThan(0);

        // Cleanup spies
        promptSpy.mockRestore();
    });
});

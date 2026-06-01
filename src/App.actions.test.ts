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

    function getActionButton(container: HTMLElement): HTMLButtonElement | null {
        return container.querySelector('[data-testid="dtv-action-0"]') as HTMLButtonElement | null;
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
                source: { type: 'collection', collectionName: 'testCollection' },
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
            actions: [{ label: 'Async Action', icon: 'pi pi-play', onClick: asyncAction }]
        });
        const root = createRoot(container);

        await act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, { value: {}, children: appElement })
            );
        });

        // Allow initial effects / state propagation + async fetchData mock
        await new Promise(r => setTimeout(r, 0));
        await waitUntil(() => getActionButton(container) !== null, { timeoutMs: 1000, intervalMs: 10 });

        const button = getActionButton(container);
        if (!button) throw new Error('Async Action button not found');
        expect(button.disabled).toBe(false);

        // Click triggers async
        await act(async () => {
            button.click();
        });

        await waitUntil(() => getActionButton(container)?.disabled === true, { timeoutMs: 1000, intervalMs: 10 });

        expect(asyncAction).toHaveBeenCalledTimes(1);
        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('Async Action...');
        expect(button.className).toContain('p-button-loading');
        expect(button.querySelector('.p-button-loading-icon')).toBeTruthy();
        expect(button.querySelector('.pi-play')).toBeFalsy();

        const actionPromise = asyncAction.mock.results[0]?.value;
        if (!(actionPromise instanceof Promise)) {
            throw new Error('Expected async action promise');
        }

        await act(async () => {
            await actionPromise;
        });

        await waitUntil(() => getActionButton(container)?.disabled === false, { timeoutMs: 1000, intervalMs: 10 });
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Async Action');
        expect(button.className).not.toContain('p-button-loading');
        expect(button.querySelector('.pi-play')).toBeTruthy();

        await act(async () => {
            root.unmount();
        });
    });

    it('renders custom toast content from an action', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const actionWithCustomToast = jest.fn((api: { showToast: (opts: unknown) => void }) => {
            api.showToast({
                severity: 'info',
                content: () => React.createElement(
                    'div',
                    null,
                    React.createElement('span', null, 'Open '),
                    React.createElement('a', { href: '/docs/actions' }, 'action docs')
                ),
                life: 3000
            });
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
            actions: [{ label: 'Toast Action', onClick: actionWithCustomToast as any }]
        });
        const root = createRoot(container);

        await act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, { value: {}, children: appElement })
            );
        });

        await new Promise(r => setTimeout(r, 0));
        await waitUntil(() => getActionButton(container) !== null, { timeoutMs: 1000, intervalMs: 10 });

        const button = getActionButton(container);
        if (!button) throw new Error('Toast Action button not found');

        await act(async () => {
            button.click();
            await new Promise(r => setTimeout(r, 0));
        });

        expect(actionWithCustomToast).toHaveBeenCalledTimes(1);

        const toastLink = await new Promise<HTMLAnchorElement>((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const link = container.querySelector('.p-toast a') as HTMLAnchorElement | null;
                if (link) {
                    resolve(link);
                    return;
                }
                if (Date.now() - start > 1000) {
                    reject(new Error('Timed out waiting for custom toast link'));
                    return;
                }
                setTimeout(check, 10);
            };
            check();
        });

        expect(toastLink.textContent).toBe('action docs');
        expect(toastLink.getAttribute('href')).toBe('/docs/actions');
        expect(container.querySelector('.p-toast')?.textContent).toContain('Open action docs');

        await act(async () => {
            root.unmount();
        });
    });
});

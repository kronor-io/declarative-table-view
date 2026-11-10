/**
 * @jest-environment jsdom
 *
 * `DTVAPI.runAction` runs a toolbar action for a host that starts it from a control of its
 * own: as a click on the action's button would, with the actions of the last render.
 */
import { afterEach, beforeEach, describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

jest.mock('./framework/graphql-client', () => {
    return {
        createGraphQLClient: jest.fn(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
});

jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return {
        ...actual,
        fetchData: jest.fn(async () => ({ rows: [{ id: 1 }], flattenedRows: [{ id: { id: 1 } }] }))
    };
});

import App, { type DTVAPI } from './App';
import type { ActionAPI, ActionDefinition } from './framework/actions';
import type { DTVAnalyticsEvent } from './framework/analytics';
import type { Runtime } from './framework/runtime';
import { waitUntil } from './test/waitUntil';

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

const runtime: Runtime = {
    cellRenderers: { text: () => 'cell' },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

// Mounts App with the given actions and waits until its rows are on screen and its API is set.
async function renderApp(actions: ActionDefinition[], onEvent: (event: DTVAnalyticsEvent) => void = () => undefined) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const apiRef = React.createRef<DTVAPI | null>();

    const render = (nextActions: ActionDefinition[]) => act(async () => {
        root.render(
            React.createElement(PrimeReactProvider, {
                value: {},
                children: React.createElement(App, {
                    graphqlHost: 'http://example.com/graphql',
                    requestHeaders: { Authorization: 'Bearer token' },
                    showViewsMenu: false,
                    showViewTitle: false,
                    viewsJson,
                    externalRuntime: runtime,
                    syncFilterStateToUrl: false,
                    actions: nextActions,
                    analytics: { onEvent },
                    apiRef
                })
            })
        );
    });

    await render(actions);
    await waitUntil(() => container.querySelector('[data-testid="pagination-page"]') !== null, { description: 'the rows to render' });
    await waitUntil(() => apiRef.current !== null, { description: 'the API to be set' });

    return {
        container,
        api: () => apiRef.current!,
        rerender: render,
        unmount: async () => {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        }
    };
}

describe('DTVAPI.runAction', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('runs the action with that id as a click on its button would', async () => {
        let finish = () => { };
        const apis: ActionAPI[] = [];
        const exportAction: ActionDefinition = {
            label: 'Export',
            id: 'csv-export',
            onClick: api => {
                apis.push(api);
                return new Promise<void>(resolve => { finish = resolve; });
            }
        };
        const otherAction: ActionDefinition = { label: 'Other', id: 'other', onClick: jest.fn<ActionDefinition['onClick']>() };
        const events: DTVAnalyticsEvent[] = [];
        const { container, api, unmount } = await renderApp([otherAction, exportAction], event => events.push(event));
        const button = () => container.querySelector('[data-testid="dtv-action-1"]') as HTMLButtonElement;

        await act(async () => {
            api().runAction('csv-export');
        });

        expect(apis).toHaveLength(1);
        expect(apis[0].shownRows).toMatchObject({ rowsPerPage: 20, ordering: null, cursors: [] });
        expect(apis[0].shownRows?.view.id).toBe('test-view');
        expect(otherAction.onClick).not.toHaveBeenCalled();

        // The button shows it running, and a run while it is running does nothing
        expect(button().disabled).toBe(true);
        expect(button().textContent).toContain('Export...');
        await act(async () => {
            api().runAction('csv-export');
        });
        expect(apis).toHaveLength(1);

        await act(async () => {
            finish();
        });
        expect(button().disabled).toBe(false);
        expect(events.filter(event => event.type === 'action')).toEqual([
            expect.objectContaining({ action: 'csv-export', selectedRows: 0, outcome: 'succeeded' })
        ]);

        await unmount();
    });

    it('does nothing, with a warning, for an id no action has', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        // Ids only: a label is not an id
        const action: ActionDefinition = { label: 'Export', id: 'csv-export', onClick: jest.fn<ActionDefinition['onClick']>() };
        const { api, unmount } = await renderApp([action]);

        await act(async () => {
            api().runAction('Export');
        });

        expect(action.onClick).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Export"'));

        await unmount();
    });

    it('runs the actions of the last render', async () => {
        const first: ActionDefinition = { label: 'Export', id: 'csv-export', onClick: jest.fn<ActionDefinition['onClick']>() };
        const second: ActionDefinition = { label: 'Export', id: 'csv-export', onClick: jest.fn<ActionDefinition['onClick']>() };
        const { api, rerender, unmount } = await renderApp([first]);

        await rerender([second]);
        await act(async () => {
            api().runAction('csv-export');
        });

        expect(first.onClick).not.toHaveBeenCalled();
        expect(second.onClick).toHaveBeenCalledTimes(1);

        await unmount();
    });

    it('does not run a disabled action, as its button cannot be clicked', async () => {
        const action: ActionDefinition = { label: 'Export', id: 'csv-export', disabled: true, onClick: jest.fn<ActionDefinition['onClick']>() };
        const { api, unmount } = await renderApp([action]);

        await act(async () => {
            api().runAction('csv-export');
        });

        expect(action.onClick).not.toHaveBeenCalled();

        await unmount();
    });
});

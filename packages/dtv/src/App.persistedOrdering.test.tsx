/**
 * @jest-environment jsdom
 *
 * The ordering a user sorts a view by is kept in their user data, unless they turned that
 * off for the view, and the view starts from it.
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

type FetchDataArgs = Parameters<typeof fetchData>[0];

const fetchCalls: FetchDataArgs[] = [];
const fetchDataMock = jest.fn(async (args: FetchDataArgs): Promise<FetchDataResult> => {
    fetchCalls.push(args);
    const rows = [{ id: 1, amount: 10 }];
    return { rows, flattenedRows: rows.map(r => ({ id: { id: r.id }, amount: { amount: r.amount } })) };
});
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return {
        ...actual,
        fetchData: (...args: Parameters<typeof actual.fetchData>) => fetchDataMock(...args)
    };
});

import App from './App';
import type { Runtime } from './framework/runtime';
import type { fetchData, FetchDataResult } from './framework/data';
import type { DataOrdering } from './framework/data-ordering';
import { defaultUserPreferences, type UserDataJson, type ViewDataJson } from './framework/user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './framework/user-data.migrations';
import { USER_DATA_LOCALSTORAGE_KEY } from './framework/user-data-manager';

const rawView = {
    title: 'Test View',
    id: 'test-view',
    source: { type: 'collection', collectionName: 'testCollection' },
    paginationKey: 'id',
    boolExpType: 'TestBoolExp',
    orderByType: '[TestOrderBy!]',
    columns: [
        { type: 'tableColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }], name: 'ID', cellRenderer: { section: 'cellRenderers', key: 'text' } },
        { type: 'tableColumn', id: 'amount', data: [{ type: 'valueQuery', field: 'amount' }], name: 'Amount', cellRenderer: { section: 'cellRenderers', key: 'text' } }
    ],
    filterSchema: { groups: [{ name: 'default', label: null }], filters: [] }
};

const runtime: Runtime = {
    cellRenderers: { text: () => 'cell' },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

const byAmount: DataOrdering = { field: 'amount', direction: 'DESC' };

function storeViewData(fields: Partial<ViewDataJson>): void {
    const userData: UserDataJson = {
        preferences: defaultUserPreferences,
        views: {
            'test-view': { columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [], ...fields }
        },
        revision: 1,
        formatRevision: CURRENT_USERDATA_FORMAT_REVISION
    };
    localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userData));
}

function storedViewData(): ViewDataJson | undefined {
    const stored = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY);
    return stored ? (JSON.parse(stored) as UserDataJson).views['test-view'] : undefined;
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 50)); });

async function renderApp() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            React.createElement(PrimeReactProvider, {
                value: {},
                children: React.createElement(App, {
                    graphqlHost: 'http://example.com/graphql',
                    requestHeaders: { Authorization: 'Bearer token' },
                    showViewsMenu: false,
                    showViewTitle: false,
                    viewsJson: JSON.stringify([rawView]),
                    externalRuntime: runtime,
                    syncFilterStateToUrl: false
                })
            })
        );
    });
    await settle();

    return {
        container,
        unmount: () => act(async () => { root.unmount(); container.remove(); })
    };
}

function headerCell(container: HTMLElement, name: string): HTMLElement {
    const cell = Array.from(container.querySelectorAll<HTMLElement>('th')).find(th => th.textContent?.includes(name));
    if (!cell) throw new Error(`No header cell "${name}"`);
    return cell;
}

describe('persisted ordering', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
        fetchDataMock.mockClear();
    });

    it('starts the view from the persisted ordering', async () => {
        storeViewData({ ordering: byAmount });

        const app = await renderApp();

        expect(fetchCalls.map(call => call.ordering)).toEqual([byAmount]);
        await app.unmount();
    });

    it('persists the ordering the user sorts by', async () => {
        const app = await renderApp();

        await act(async () => { headerCell(app.container, 'Amount').click(); });
        await settle();

        expect(fetchCalls.map(call => call.ordering)).toEqual([null, { field: 'amount', direction: 'ASC' }]);
        expect(storedViewData()?.ordering).toEqual({ field: 'amount', direction: 'ASC' });
        await app.unmount();
    });

    it('neither starts from nor persists an ordering when persisting it is off for the view', async () => {
        storeViewData({ syncOrderingToUserData: false, ordering: byAmount });

        const app = await renderApp();
        await act(async () => { headerCell(app.container, 'ID').click(); });
        await settle();

        expect(fetchCalls.map(call => call.ordering)).toEqual([null, { field: 'id', direction: 'ASC' }]);
        // Written as it was read: the ordering the user sorts by is not stored
        expect(storedViewData()?.ordering).toEqual(byAmount);
        await app.unmount();
    });
});

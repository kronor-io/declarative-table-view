/**
 * @jest-environment jsdom
 *
 * A table with a persisted filter state fetches once, with that filter state. It must not
 * first request the rows of the empty filter state it starts with and then supersede the
 * request once the persisted state is restored.
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

function buildFetchDataResult(): FetchDataResult {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: 5 - i }));
    const flattenedRows = rows.map(r => ({ id: { id: r.id } }));
    return { rows, flattenedRows };
}

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
    return buildFetchDataResult();
});
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return {
        ...actual,
        fetchData: (...args: Parameters<typeof actual.fetchData>) => fetchDataMock(...args)
    };
});

import App from './App';
import * as FilterValue from './framework/filterValue';
import { serializeFilterFormStateMap } from './framework/filter-form-state';
import { parseViewJson } from './framework/view-parser';
import { nativeRuntime } from './framework/native-runtime';
import type { Runtime } from './framework/runtime';
import type { UserDataLoadCallback, UserDataSaveCallback } from './framework/user-data-manager';
import type { fetchData, FetchDataResult } from './framework/data';
import { defaultUserPreferences, type UserDataJson } from './framework/user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './framework/user-data.migrations';
import { USER_DATA_LOCALSTORAGE_KEY } from './framework/user-data-manager';
import type { FilterState } from './framework/state';

const EMAIL_FILTER_ID = 'email-eq';

const rawView = {
    title: 'Test View',
    id: 'test-view',
    source: { type: 'collection', collectionName: 'testCollection' },
    paginationKey: 'id',
    boolExpType: 'TestBoolExp',
    orderByType: '[TestOrderBy!]',
    columns: [
        { type: 'tableColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }], name: 'ID', cellRenderer: { section: 'cellRenderers', key: 'text' } }
    ],
    filterSchema: {
        groups: [{ name: 'default', label: null }],
        filters: [
            {
                id: EMAIL_FILTER_ID,
                label: 'Email',
                expression: { type: 'equals', field: 'email', value: { type: 'text' } },
                group: 'default',
                aiGenerated: false
            }
        ]
    }
};

const viewsJson = JSON.stringify([rawView]);

const runtime: Runtime = {
    cellRenderers: { text: () => 'cell' },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

const parsedView = parseViewJson(rawView, nativeRuntime, runtime);

function userDataWithPersistedEmail(email: string, revision: number): UserDataJson {
    const filterState: FilterState = new Map([
        [EMAIL_FILTER_ID, { type: 'leaf', value: FilterValue.value(email) }]
    ]);
    return {
        preferences: defaultUserPreferences,
        views: {
            'test-view': {
                columnOrder: null,
                hiddenColumns: [],
                rowsPerPage: null,
                syncFilterStateToUserData: true,
                persistedFilterState: serializeFilterFormStateMap(filterState, parsedView.filterGroups),
                savedFilters: []
            }
        },
        revision,
        formatRevision: CURRENT_USERDATA_FORMAT_REVISION
    };
}

function emailOfFetchCall(call: FetchDataArgs): unknown {
    const leaf = call.filterState.get(EMAIL_FILTER_ID);
    return leaf?.type === 'leaf' && FilterValue.isValue(leaf.value) ? leaf.value.value : undefined;
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 50)); });

async function renderApp(userData?: { onLoad: UserDataLoadCallback; onSave: UserDataSaveCallback }) {
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
                    viewsJson,
                    externalRuntime: runtime,
                    syncFilterStateToUrl: false,
                    userData
                })
            })
        );
    });

    return root;
}

const remoteHolding = (userData: UserDataJson | null): UserDataLoadCallback => async ({ Result }) => {
    await new Promise(r => setTimeout(r, 5));
    return Result.success(userData);
};

const onSave: UserDataSaveCallback = async ({ Result }) => Result.success(undefined);

describe('initial fetch with a persisted filter state', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
        fetchDataMock.mockClear();
    });

    it('fetches once with the filter state persisted in localStorage', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataWithPersistedEmail('local@example.com', 3)));

        const root = await renderApp();
        await settle();

        expect(fetchCalls.map(emailOfFetchCall)).toEqual(['local@example.com']);

        await act(async () => { root.unmount(); });
    });

    it('waits for the remote load and fetches once with the filter state it brings', async () => {
        const root = await renderApp({ onLoad: remoteHolding(userDataWithPersistedEmail('remote@example.com', 3)), onSave });
        await settle();

        expect(fetchCalls.map(emailOfFetchCall)).toEqual(['remote@example.com']);

        await act(async () => { root.unmount(); });
    });

    it('fetches once when both localStorage and the remote hold the filter state', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataWithPersistedEmail('both@example.com', 3)));

        const root = await renderApp({ onLoad: remoteHolding(userDataWithPersistedEmail('both@example.com', 3)), onSave });
        await settle();

        expect(fetchCalls.map(emailOfFetchCall)).toEqual(['both@example.com']);

        await act(async () => { root.unmount(); });
    });

    it('fetches once, unfiltered, when nothing is persisted', async () => {
        const root = await renderApp({ onLoad: remoteHolding(null), onSave });
        await settle();

        expect(fetchCalls.map(emailOfFetchCall)).toEqual([undefined]);

        await act(async () => { root.unmount(); });
    });
});

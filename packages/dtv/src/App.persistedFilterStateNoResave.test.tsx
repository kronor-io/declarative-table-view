/**
 * @jest-environment jsdom
 *
 * Restoring a persisted filter state must not write it back: the write would only bump
 * the user-data revision, making the next write of every other open tab stale. And a
 * persisted state that another tab writes later must not change the filters the user
 * sees in this tab.
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

async function waitFor(predicate: () => boolean, timeoutMs = 1000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out. fetch emails so far: ${JSON.stringify(fetchCalls.map(emailOfFetchCall))}`);
        }
        // Inside act: the table's updates while waiting are part of what is awaited
        await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 50)); });

describe('persisted filter state is restored without being written back', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
        fetchDataMock.mockClear();
    });

    it('restores the remote filter state without saving, and ignores a later cross-tab update', async () => {
        const onLoad: UserDataLoadCallback = async ({ Result }) => {
            await new Promise(r => setTimeout(r, 5));
            return Result.success(userDataWithPersistedEmail('first@example.com', 3));
        };
        const onSave = jest.fn<UserDataSaveCallback>(async ({ Result }) => Result.success(undefined));

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
                        aiIntegration: { type: 'builtInGemini' as const, geminiApiKey: 'gemini' },
                        showViewsMenu: false,
                        showViewTitle: false,
                        viewsJson,
                        externalRuntime: runtime,
                        syncFilterStateToUrl: false,
                        userData: { onLoad, onSave }
                    })
                })
            );
        });

        await waitFor(() => fetchCalls.some(c => emailOfFetchCall(c) === 'first@example.com'));
        await settle();

        // The restored state is what the remote already holds: nothing to write.
        expect(onSave).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY) as string).revision).toBe(3);

        // Another tab persists a different filter for this view.
        const otherTabWrite = JSON.stringify(userDataWithPersistedEmail('second@example.com', 4));
        await act(async () => {
            localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, otherTabWrite);
            window.dispatchEvent(new StorageEvent('storage', {
                key: USER_DATA_LOCALSTORAGE_KEY,
                newValue: otherTabWrite,
                storageArea: localStorage
            }));
        });
        await settle();

        const emails = fetchCalls.map(emailOfFetchCall);
        expect(emails).not.toContain('second@example.com');
        expect([...emails].reverse().find(e => e !== undefined)).toBe('first@example.com');
        expect(onSave).not.toHaveBeenCalled();

        await act(async () => { root.unmount(); });
    });
});

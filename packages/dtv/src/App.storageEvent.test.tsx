/**
 * @jest-environment jsdom
 *
 * The `storage` event handler: what another tab writes to localStorage shows up in this
 * tab (column visibility, saved filters), events for other keys are ignored, and an older
 * copy never rolls this tab back. The live filter state is covered by
 * App.persistedFilterStateNoResave.test.tsx.
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
    const rows = [{ id: 1, email: 'one@example.com' }, { id: 2, email: 'two@example.com' }];
    return { rows, flattenedRows: rows.map(r => ({ id: { id: r.id }, email: { email: r.email } })) };
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
import type { fetchData, FetchDataResult } from './framework/data';
import { CURRENT_FORMAT_REVISION } from './framework/saved-filters';
import type { FilterState } from './framework/state';
import { defaultUserPreferences, type UserDataJson, type ViewDataJson } from './framework/user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './framework/user-data.migrations';
import { USER_DATA_LOCALSTORAGE_KEY } from './framework/user-data-storage';
import type { UserDataLoadCallback, UserDataSaveCallback } from './framework/user-data-manager';

const VIEW_ID = 'test-view';
const EMAIL_FILTER_ID = 'email-eq';

const rawView = {
    title: 'Test View',
    id: VIEW_ID,
    source: { type: 'collection', collectionName: 'testCollection' },
    paginationKey: 'id',
    boolExpType: 'TestBoolExp',
    orderByType: '[TestOrderBy!]',
    columns: [
        { type: 'tableColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }], name: 'ID', cellRenderer: { section: 'cellRenderers', key: 'text' } },
        { type: 'tableColumn', id: 'email', data: [{ type: 'valueQuery', field: 'email' }], name: 'Email', cellRenderer: { section: 'cellRenderers', key: 'text' } }
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

const runtime: Runtime = {
    cellRenderers: { text: () => 'cell' },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

const parsedView = parseViewJson(rawView, nativeRuntime, runtime);

const persistedEmail = (email: string) => {
    const filterState: FilterState = new Map([[EMAIL_FILTER_ID, { type: 'leaf', value: FilterValue.value(email) }]]);
    return serializeFilterFormStateMap(filterState, parsedView.filterGroups);
};

const fetchedEmails = () => fetchCalls.map((call) => {
    const leaf = call.filterState.get(EMAIL_FILTER_ID);
    return leaf?.type === 'leaf' && FilterValue.isValue(leaf.value) ? leaf.value.value : undefined;
});

const viewJson = (overrides: Partial<ViewDataJson> = {}): ViewDataJson => ({
    columnOrder: null,
    hiddenColumns: [],
    rowsPerPage: null,
    syncFilterStateToUserData: true,
    persistedFilterState: null,
    savedFilters: [],
    ...overrides
});

const userDataJson = (view: ViewDataJson, revision: number): UserDataJson => ({
    preferences: defaultUserPreferences,
    views: { [VIEW_ID]: view },
    revision,
    formatRevision: CURRENT_USERDATA_FORMAT_REVISION
});

const savedFilterFromOtherTab = {
    id: 'sf-other-tab',
    name: 'From the other tab',
    view: VIEW_ID,
    state: {},
    createdAt: '2026-10-04T10:00:00.000Z',
    formatRevision: CURRENT_FORMAT_REVISION
};

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 50)); });

const columnHeaders = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('th')).map(th => th.textContent?.trim() ?? '');

const anotherTabWrites = (userData: UserDataJson, key: string = USER_DATA_LOCALSTORAGE_KEY) => act(async () => {
    const newValue = JSON.stringify(userData);
    localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
});

const mount = async (onLoad: UserDataLoadCallback, onSave: UserDataSaveCallback) => {
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
                    viewsJson: JSON.stringify([rawView]),
                    externalRuntime: runtime,
                    syncFilterStateToUrl: false,
                    userData: { onLoad, onSave }
                })
            })
        );
    });
    await settle();
    return { root, container };
};

describe('storage event from another tab', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
        fetchDataMock.mockClear();
    });

    it('leaves the live filters alone in a tab that loaded without a persisted filter', async () => {
        const onLoad: UserDataLoadCallback = async ({ Result }) => Result.success(userDataJson(viewJson(), 3));
        const onSave = jest.fn<UserDataSaveCallback>(async ({ Result }) => Result.success(undefined));
        const { root } = await mount(onLoad, onSave);

        await anotherTabWrites(userDataJson(viewJson({ persistedFilterState: persistedEmail('other@example.com') }), 4));
        await settle();

        expect(fetchedEmails()).not.toContain('other@example.com');
        expect(onSave).not.toHaveBeenCalled();
        await act(async () => { root.unmount(); });
    });

    it('shows the other tab\'s column visibility and saved filters, ignores other keys and older copies', async () => {
        const onLoad: UserDataLoadCallback = async ({ Result }) => Result.success(userDataJson(viewJson(), 3));
        const onSave = jest.fn<UserDataSaveCallback>(async ({ Result }) => Result.success(undefined));
        const { root, container } = await mount(onLoad, onSave);
        expect(columnHeaders(container)).toEqual(expect.arrayContaining(['ID', 'Email']));

        const otherTabWrite = userDataJson(viewJson({ hiddenColumns: ['email'], savedFilters: [savedFilterFromOtherTab] }), 4);

        // A storage event for some other key changes nothing.
        await anotherTabWrites(otherTabWrite, 'unrelated-key');
        await settle();
        expect(columnHeaders(container)).toEqual(expect.arrayContaining(['ID', 'Email']));

        // The event for the user data key makes the other tab's write visible here.
        await anotherTabWrites(otherTabWrite);
        await settle();
        expect(columnHeaders(container)).toContain('ID');
        expect(columnHeaders(container)).not.toContain('Email');

        const savedFiltersButton = Array.from(container.querySelectorAll('button'))
            .find(button => /saved filters/i.test(button.textContent ?? '')) as HTMLButtonElement | undefined;
        expect(savedFiltersButton).toBeDefined();
        await act(async () => { savedFiltersButton!.click(); });
        await settle();
        expect(container.textContent).toContain('From the other tab');

        // An older copy (a tab that never saw revision 4) does not roll this tab back.
        await anotherTabWrites(userDataJson(viewJson(), 2));
        await settle();
        expect(columnHeaders(container)).not.toContain('Email');

        // Adopting another tab's data is not a change of our own: nothing is written.
        expect(onSave).not.toHaveBeenCalled();

        await act(async () => { root.unmount(); });
    });
});

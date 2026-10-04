/**
 * @jest-environment jsdom
 *
 * Switching views restores the persisted filter state of the view switched to, whatever
 * the view switched from had. Regression test: when view data for the new view arrived a
 * render late, the hydration effect settled the new view on the old view's data.
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

jest.mock('graphql-request', () => ({
    GraphQLClient: jest.fn().mockImplementation(() => ({ request: jest.fn(async () => ({})) }))
}), { virtual: true });

type FetchDataArgs = Parameters<typeof fetchData>[0];

const fetchCalls: FetchDataArgs[] = [];
const fetchDataMock = jest.fn(async (args: FetchDataArgs): Promise<FetchDataResult> => {
    fetchCalls.push(args);
    const rows = [{ id: 1 }];
    return { rows, flattenedRows: rows.map(r => ({ id: { id: r.id } })) };
});
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return { ...actual, fetchData: (...args: Parameters<typeof actual.fetchData>) => fetchDataMock(...args) };
});

import App from './App';
import * as FilterValue from './framework/filterValue';
import { serializeFilterFormStateMap } from './framework/filter-form-state';
import { parseViewJson } from './framework/view-parser';
import { nativeRuntime } from './framework/native-runtime';
import type { Runtime } from './framework/runtime';
import type { UserDataLoadCallback, UserDataSaveCallback } from './framework/user-data-manager';
import type { fetchData, FetchDataResult } from './framework/data';
import { defaultUserPreferences, type ViewDataJson } from './framework/user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './framework/user-data.migrations';
import type { FilterState } from './framework/state';

const EMAIL_FILTER_ID = 'email-eq';

const rawView = (id: string, title: string) => ({
    title,
    id,
    source: { type: 'collection', collectionName: id },
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
});

const rawViews = [rawView('view-a', 'View A'), rawView('view-b', 'View B')];

const runtime: Runtime = {
    cellRenderers: { text: () => 'cell' },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

const parsedView = parseViewJson(rawViews[0], nativeRuntime, runtime);

const persistedEmail = (email: string) => {
    const filterState: FilterState = new Map([[EMAIL_FILTER_ID, { type: 'leaf', value: FilterValue.value(email) }]]);
    return serializeFilterFormStateMap(filterState, parsedView.filterGroups);
};

const viewJson = (persistedFilterState: unknown): ViewDataJson => ({
    columnOrder: null,
    hiddenColumns: [],
    rowsPerPage: null,
    syncFilterStateToUserData: true,
    persistedFilterState,
    savedFilters: []
});

const fetchedEmails = () => fetchCalls.map((call) => {
    const leaf = call.filterState.get(EMAIL_FILTER_ID);
    return leaf?.type === 'leaf' && FilterValue.isValue(leaf.value) ? leaf.value.value : undefined;
});

const settle = (ms = 60) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function mount(views: Record<string, ViewDataJson>) {
    const onLoad: UserDataLoadCallback = async ({ Result }) => {
        await new Promise(r => setTimeout(r, 5));
        return Result.success({ preferences: defaultUserPreferences, views, revision: 3, formatRevision: CURRENT_USERDATA_FORMAT_REVISION });
    };
    const onSave = jest.fn<UserDataSaveCallback>(async ({ Result }) => Result.success(undefined));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(React.createElement(PrimeReactProvider, {
            value: {},
            children: React.createElement(App, {
                graphqlHost: 'http://example.com/graphql',
                requestHeaders: {},
                showViewsMenu: true,
                showViewTitle: true,
                viewsJson: JSON.stringify(rawViews),
                externalRuntime: runtime,
                syncFilterStateToUrl: false,
                userData: { onLoad, onSave }
            })
        }));
    });
    await settle();
    return { root, container, onSave };
}

async function switchTo(container: HTMLElement, title: string) {
    const menuLinks = () => Array.from(container.querySelectorAll('a.p-menuitem-link')) as HTMLElement[];
    const viewsMenu = menuLinks().find(link => link.textContent?.includes('Views'));
    if (viewsMenu) {
        await act(async () => { viewsMenu.click(); });
        await settle(20);
    }
    const link = menuLinks().find(el => el.textContent?.trim() === title);
    if (!link) throw new Error(`No menu item "${title}"`);
    await act(async () => { link.click(); });
    await settle();
}

describe('view switch restores the persisted filter of the new view', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
    });

    it('restores view B\'s filter when view A had none', async () => {
        const { root, container, onSave } = await mount({
            'view-a': viewJson(null),
            'view-b': viewJson(persistedEmail('b@example.com'))
        });

        await switchTo(container, 'View B');

        expect(container.textContent).toContain('View B');
        expect(fetchedEmails()).toContain('b@example.com');
        expect(onSave).not.toHaveBeenCalled();
        await act(async () => { root.unmount(); });
    });

    it('restores view B\'s own filter, not view A\'s', async () => {
        const { root, container, onSave } = await mount({
            'view-a': viewJson(persistedEmail('a@example.com')),
            'view-b': viewJson(persistedEmail('b@example.com'))
        });

        await switchTo(container, 'View B');

        const emails = fetchedEmails();
        expect(emails).toContain('a@example.com');
        expect([...emails].reverse().find(email => email !== undefined)).toBe('b@example.com');
        expect(onSave).not.toHaveBeenCalled();
        await act(async () => { root.unmount(); });
    });
});

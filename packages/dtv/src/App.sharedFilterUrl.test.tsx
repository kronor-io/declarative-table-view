/**
 * @jest-environment jsdom
 *
 * A filter state shared in the URL opens the view it was shared from. Links from before
 * views were named in them still apply to the first view.
 */
import { afterEach, describe, it, expect, jest } from '@jest/globals';
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
    return { rows: [], flattenedRows: [] };
});
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return { ...actual, fetchData: (...args: Parameters<typeof actual.fetchData>) => fetchDataMock(...args) };
});

import App from './App';
import * as FilterValue from './framework/filterValue';
import { encodeSharedFilterState } from './framework/filter-sharing';
import { parseViewJson } from './framework/view-parser';
import { nativeRuntime } from './framework/native-runtime';
import type { Runtime } from './framework/runtime';
import type { fetchData, FetchDataResult } from './framework/data';
import type { FilterState } from './framework/state';
import { defineMigration, defineViewMigrations } from './dsl/migrations';

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

const filterGroups = parseViewJson(rawViews[0], nativeRuntime, runtime).filterGroups;
const emailFilter = (email: string): FilterState => new Map([[EMAIL_FILTER_ID, { type: 'leaf', value: FilterValue.value(email) }]]);
const toBase64Url = (json: unknown) => btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const fetched = () => fetchCalls.map((call) => {
    const leaf = call.filterState.get(EMAIL_FILTER_ID);
    return {
        collection: call.view.source.type === 'collection' ? call.view.source.collectionName : undefined,
        email: leaf?.type === 'leaf' && FilterValue.isValue(leaf.value) ? leaf.value.value : undefined
    };
});

const settle = (ms = 60) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function mountWithUrlParam(param: string, views: unknown[] = rawViews, externalRuntime: Runtime = runtime) {
    window.history.replaceState({}, '', `/?dtv-filter-state=${param}`);
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
                viewsJson: JSON.stringify(views),
                externalRuntime,
                syncFilterStateToUrl: true
            })
        }));
    });
    await settle();
    return { root, container };
}

describe('filter state shared in the URL', () => {
    afterEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
        window.history.replaceState({}, '', '/');
    });

    it('opens the view the filter state was shared from', async () => {
        const { root, container } = await mountWithUrlParam(encodeSharedFilterState({ id: 'view-b', filterGroups }, emailFilter('b@example.com')));

        expect(container.textContent).toContain('View B');
        expect(fetched()[0]).toEqual({ collection: 'view-b', email: 'b@example.com' });
        await act(async () => { root.unmount(); });
    });

    it('applies a link from before views were named in them to the first view', async () => {
        const { root } = await mountWithUrlParam(toBase64Url({ [EMAIL_FILTER_ID]: { type: 'leaf', value: { type: 'value', value: 'a@example.com' } } }));

        expect(fetched()[0]).toEqual({ collection: 'view-a', email: 'a@example.com' });
        await act(async () => { root.unmount(); });
    });

    it('ignores a filter state for a view the table does not have', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { root } = await mountWithUrlParam(encodeSharedFilterState({ id: 'view-z', filterGroups }, emailFilter('z@example.com')));

        expect(fetched()[0]).toEqual({ collection: 'view-a', email: undefined });
        expect(warn).toHaveBeenCalledWith('The filter state in the URL is for view "view-z", which this table does not have');
        warn.mockRestore();
        await act(async () => { root.unmount(); });
    });

    it('migrates a filter state shared for an older revision of the view', async () => {
        const emailLeaf = { kind: 'leaf', cmp: 'equals', field: 'email', control: { type: 'text' } } as const;
        const rev1 = { definition: 'view-a', revision: 1, filters: { 'email-old': emailLeaf }, columns: { id: { orderBy: 'id' } } } as const;
        const rev2 = { definition: 'view-a', revision: 2, filters: { [EMAIL_FILTER_ID]: emailLeaf }, columns: { id: { orderBy: 'id' } } } as const;
        const migrations = defineViewMigrations(rev1, [defineMigration(rev1, rev2, m => [m.renameFilter('email-old', EMAIL_FILTER_ID)])]);
        const viewWithMigrations = { ...rawViews[0], migrations: { section: 'viewMigrations', key: 'view-a' } };
        const sharedForRevision1 = toBase64Url({
            view: 'view-a',
            rev: 1,
            state: { 'email-old': { type: 'leaf', value: { type: 'value', value: 'old@example.com' } } }
        });

        const { root } = await mountWithUrlParam(sharedForRevision1, [viewWithMigrations], { ...runtime, viewMigrations: { 'view-a': migrations } });

        expect(fetched()[0]).toEqual({ collection: 'view-a', email: 'old@example.com' });
        await act(async () => { root.unmount(); });
    });
});

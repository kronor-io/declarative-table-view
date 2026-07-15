/**
 * @jest-environment jsdom
 *
 * Regression test for the "filter applied → empty → filter again" flicker.
 *
 * When a consumer passes a new `views` reference (e.g. a memo recomputed on
 * every GraphQL emission), DTV re-creates its user-data manager, which re-runs
 * the async remote `onLoad`. Previously, every resolved reload pushed
 * `persistedFilterState` back through the hydration effect and re-applied it,
 * racing with — and clobbering — the filter the user already had applied, and
 * firing extra GraphQL requests. Persisted filter state must now be restored at
 * most once per view selection.
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

function buildFetchDataResult() {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: 20 - i }));
    const flattenedRows = rows.map(r => ({ id: { id: r.id } }));
    return { rows, flattenedRows } as any;
}

jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

const fetchCalls: any[] = [];
const fetchDataMock = jest.fn(async (arg: any) => {
    fetchCalls.push(arg);
    return buildFetchDataResult();
});
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return {
        ...actual,
        fetchData: (...args: any[]) => (fetchDataMock as any)(...args)
    };
});

import App from './App';
import * as FilterValue from './framework/filterValue';
import { serializeFilterFormStateMap } from './framework/filter-form-state';
import { parseViewJson } from './framework/view-parser';
import { nativeRuntime } from './framework/native-runtime';
import { defaultUserPreferences } from './framework/user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './framework/user-data.migrations';
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

const makeRuntime = () => ({
    cellRenderers: { text: () => 'cell' },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {}
});

// Parse once (with a throwaway runtime) purely to obtain filterGroups so we can
// serialize persisted filter payloads with the library's own serializer.
const parsedView = parseViewJson(rawView, nativeRuntime as any, makeRuntime() as any);

function persistedFilterFor(email: string) {
    const filterState: FilterState = new Map([
        [EMAIL_FILTER_ID, { type: 'leaf', value: FilterValue.value(email) }]
    ]);
    return serializeFilterFormStateMap(filterState, parsedView.filterGroups);
}

function emailOfFetchCall(call: any): unknown {
    const leaf = call?.filterState?.get?.(EMAIL_FILTER_ID);
    if (!leaf || leaf.type !== 'leaf') return undefined;
    const value = leaf.value;
    return value && value.type === 'value' ? value.value : undefined;
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out. fetch emails so far: ${JSON.stringify(fetchCalls.map(emailOfFetchCall))}`);
        }
        await new Promise(r => setTimeout(r, 10));
    }
}

describe('persisted filter state race', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchCalls.length = 0;
        fetchDataMock.mockClear();
    });

    it('restores persisted filter state at most once per view, even when the manager reloads with a different snapshot', async () => {
        // The async remote load returns a DIFFERENT persisted filter on each call:
        // first "first@example.com", then a stale "second@example.com". The second
        // reload (triggered by a new `views` reference) must not overwrite the
        // already-restored filter nor issue a fetch for it.
        let loadCall = 0;
        const onLoad = async ({ Result }: any) => {
            loadCall += 1;
            const email = loadCall === 1 ? 'first@example.com' : 'second@example.com';
            await new Promise(r => setTimeout(r, 5));
            return Result.success({
                preferences: defaultUserPreferences,
                views: {
                    'test-view': {
                        columnOrder: null,
                        hiddenColumns: [],
                        rowsPerPage: null,
                        syncFilterStateToUserData: true,
                        persistedFilterState: persistedFilterFor(email),
                        savedFilters: []
                    }
                },
                revision: loadCall,
                formatRevision: CURRENT_USERDATA_FORMAT_REVISION
            });
        };
        const userData = { onLoad };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const render = (runtime: unknown) => act(async () => {
            root.render(
                React.createElement(PrimeReactProvider, {
                    value: {},
                    children: React.createElement(App, {
                        graphqlHost: 'http://example.com/graphql',
                        requestHeaders: { Authorization: 'Bearer token' },
                        geminiApiKey: 'gemini',
                        showViewsMenu: false,
                        showViewTitle: false,
                        viewsJson,
                        externalRuntime: runtime as any,
                        syncFilterStateToUrl: false,
                        userData
                    })
                })
            );
        });

        await render(makeRuntime());

        // First remote load resolves and its persisted filter is restored once.
        await waitFor(() => fetchCalls.some(c => emailOfFetchCall(c) === 'first@example.com'));

        // Force a manager re-creation by handing DTV a brand-new `views` identity
        // (new runtime reference => views memo recomputes). This re-runs onLoad,
        // which now returns the stale "second@example.com" snapshot.
        await render(makeRuntime());
        await new Promise(r => setTimeout(r, 60));
        await act(async () => { await new Promise(r => setTimeout(r, 10)); });

        const emails = fetchCalls.map(emailOfFetchCall);

        // The stale reload must never have been applied.
        expect(emails).not.toContain('second@example.com');
        // The user's restored filter was fetched...
        expect(emails).toContain('first@example.com');
        // ...and remains the effective filter after the reload settled.
        const lastFilteredEmail = [...emails].reverse().find(e => e !== undefined);
        expect(lastFilteredEmail).toBe('first@example.com');

        await act(async () => { root.unmount(); });
    });
});

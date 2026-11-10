/**
 * @jest-environment jsdom
 *
 * A table reports what happens in it through `analytics.onEvent`: numbered in order, each
 * with its view's definition, requests as spans that name the filters they were made for.
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
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

const oneRow = (): FetchDataResult => ({ rows: [{ id: 1 }], flattenedRows: [{ id: { id: 1 } }] });
const fetchDataMock = jest.fn<(args: Parameters<typeof fetchData>[0]) => Promise<FetchDataResult>>(async () => oneRow());
jest.mock('./framework/data', () => {
    const actual = jest.requireActual<typeof import('./framework/data')>('./framework/data');
    return {
        ...actual,
        fetchData: (...args: Parameters<typeof actual.fetchData>) => fetchDataMock(...args)
    };
});

import App, { type AppProps } from './App';
import type { Runtime } from './framework/runtime';
import type { fetchData, FetchDataResult } from './framework/data';
import type { DTVAnalyticsEvent } from './framework/analytics';
import { FetchError } from './framework/fetch-error';
import { startPageSession } from './framework/analytics-emitter';
import { failure, success } from './framework/result';
import { defaultUserPreferences } from './framework/user-data';

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

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 50)); });

async function renderApp(
    onEvent: (event: DTVAnalyticsEvent) => void,
    { strict = false, userData }: { strict?: boolean; userData?: AppProps['userData'] } = {}
) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        const app = (
            React.createElement(PrimeReactProvider, {
                value: {},
                children: React.createElement(App, {
                    graphqlHost: 'http://example.com/graphql',
                    requestHeaders: { Authorization: 'Bearer token' },
                    showViewsMenu: false,
                    showViewTitle: false,
                    viewsJson: JSON.stringify([rawView]),
                    externalRuntime: runtime,
                    syncFilterStateToUrl: false,
                    analytics: { onEvent },
                    userData
                })
            })
        );
        root.render(strict ? React.createElement(React.StrictMode, null, app) : app);
    });
    await settle();

    return {
        container,
        unmount: () => act(async () => { root.unmount(); container.remove(); })
    };
}

function ofType<T extends DTVAnalyticsEvent['type']>(events: DTVAnalyticsEvent[], type: T): Extract<DTVAnalyticsEvent, { type: T }>[] {
    return events.filter((event): event is Extract<DTVAnalyticsEvent, { type: T }> => event.type === type);
}

describe('analytics', () => {
    beforeEach(() => {
        localStorage.clear();
        // Each test loads the page again
        startPageSession();
        fetchDataMock.mockReset();
        fetchDataMock.mockImplementation(async () => oneRow());
    });

    it('reports the session starting, the table opening, its first request and closing, numbered in order', async () => {
        const events: DTVAnalyticsEvent[] = [];
        const app = await renderApp(event => events.push(event));
        await app.unmount();

        expect(events.map(event => event.type)).toEqual(['sessionStarted', 'viewMounted', 'userDataLoad', 'filtersApplied', 'fetch', 'viewUnmounted']);
        expect(events.map(event => event.seq)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(new Set(events.map(event => event.instanceId)).size).toBe(1);
        expect(events[0]).toMatchObject({ type: 'sessionStarted', dtvVersion: 'development' });
        expect(events[1]).toMatchObject({ viewId: 'test-view', definition: 'test-view', definitionRevision: 1, popout: false });

        const [applied] = ofType(events, 'filtersApplied');
        const [fetch] = ofType(events, 'fetch');
        expect(applied).toMatchObject({ trigger: 'initial', filters: {} });
        expect(fetch).toMatchObject({
            reason: 'filters',
            page: 0,
            rowsPerPage: 20,
            ordering: null,
            filtersSeq: applied.seq,
            outcome: 'succeeded',
            rowCount: 1,
            hasMore: false
        });
        expect(fetch.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('reports the same in StrictMode, which mounts tables twice in development', async () => {
        const events: DTVAnalyticsEvent[] = [];
        const app = await renderApp(event => events.push(event), { strict: true });
        await app.unmount();

        expect(events.map(event => event.type)).toEqual(['sessionStarted', 'viewMounted', 'userDataLoad', 'filtersApplied', 'fetch', 'viewUnmounted']);
    });

    it('reports the user data failing to be written as the table loads once in StrictMode', async () => {
        const events: DTVAnalyticsEvent[] = [];
        const app = await renderApp(event => events.push(event), {
            strict: true,
            // Nothing stored remotely: the local copy is pushed, and the push fails
            userData: { onLoad: async () => success(null), onSave: async () => failure('the API is down') }
        });
        await app.unmount();

        expect(events.filter(event => event.type === 'userDataSaveFailed')).toHaveLength(1);
        expect(events.filter(event => event.type === 'userDataLoad')).toHaveLength(1);
    });

    it('reports the user data turning read-only as the table loads once in StrictMode', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const events: DTVAnalyticsEvent[] = [];
        const app = await renderApp(event => events.push(event), {
            strict: true,
            // Written by a newer version, in a format this one cannot read
            userData: {
                onLoad: async () => success({ preferences: defaultUserPreferences, views: {}, revision: 1, formatRevision: '2099-01-01T00:00:00.000Z' }),
                onSave: async () => success(undefined)
            }
        });
        await app.unmount();

        expect(events.filter(event => event.type === 'userDataReadOnly')).toHaveLength(1);
    });

    it('reports one session for the tables of a page, started by the first one', async () => {
        const events: DTVAnalyticsEvent[] = [];
        const first = await renderApp(event => events.push(event));
        const second = await renderApp(event => events.push(event));
        await first.unmount();
        await second.unmount();

        expect(events.filter(event => event.type === 'sessionStarted')).toHaveLength(1);
        expect(new Set(events.map(event => event.sessionId)).size).toBe(1);
        expect(new Set(events.map(event => event.instanceId)).size).toBe(2);
        // The second table's events start from its own mount
        expect(events.filter(event => event.instanceId !== events[0]?.instanceId)[0]).toMatchObject({ type: 'viewMounted', seq: 1 });
    });

    it('reports a failed request with what kind of failure it was, and shows no rows', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        fetchDataMock.mockImplementation(async () => {
            throw new FetchError({ kind: 'timeout', message: 'canceling statement due to statement timeout' });
        });
        const events: DTVAnalyticsEvent[] = [];
        const app = await renderApp(event => events.push(event));

        expect(ofType(events, 'fetch')).toEqual([expect.objectContaining({
            outcome: 'failed',
            error: { kind: 'timeout', message: 'canceling statement due to statement timeout' }
        })]);
        // Until the table shows failures, a failed request shows no rows
        expect(app.container.querySelector('tbody')?.textContent).toBe('No available options');
        await app.unmount();
    });

    it('keeps working when the handler throws', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const app = await renderApp(() => { throw new Error('the handler broke'); });

        expect(fetchDataMock).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith('The analytics event handler failed:', expect.any(Error));
        await app.unmount();
    });
});

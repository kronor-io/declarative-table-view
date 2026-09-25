import { fetchData } from './data';
import { View } from './view';
import { ColumnDefinition } from './column-definition';
import type { FilterGroups } from './filters';

// A caller aborts a request it no longer wants (a newer one superseded it, or its table
// unmounted). fetchData must then reject with an AbortError and never hand back rows.

const view: View = {
    title: 'Test',
    id: 'test',
    source: { type: 'collection', collectionName: 'testCollection' },
    columnDefinitions: [{ type: 'virtualColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }] } as ColumnDefinition],
    filterGroups: [] as FilterGroups,
    boolExpType: 'BoolExp',
    orderByType: '[OrderBy!]',
    paginationKey: 'id'
};

const fetch = (client: any, signal?: AbortSignal) => fetchData({
    client,
    view,
    query: 'query',
    filterState: new Map(),
    rowLimit: 10,
    cursor: null,
    signal
});

describe('fetchData abort', () => {
    it('passes the signal to the client so the HTTP request is cancelled', async () => {
        const client: any = { request: jest.fn(async () => ({ testCollection: [{ id: 1 }] })) };
        const controller = new AbortController();

        await expect(fetch(client, controller.signal)).resolves.toMatchObject({ rows: [{ id: 1 }] });
        expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
    });

    it('discards a response that arrives after the request was aborted', async () => {
        // A client that ignores the signal and still delivers the response
        let respond: (rows: Record<string, unknown>[]) => void = () => {};
        const client: any = {
            request: jest.fn(() => new Promise(resolve => {
                respond = rows => resolve({ testCollection: rows });
            }))
        };
        const controller = new AbortController();

        const result = fetch(client, controller.signal);
        controller.abort();
        respond([{ id: 1 }]);

        await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects with an AbortError whatever error an aborted client raises', async () => {
        // e.g. a custom fetch implementation that doesn't raise a DOMException
        const client: any = { request: jest.fn(async () => { throw new TypeError('Failed to fetch'); }) };
        const controller = new AbortController();
        controller.abort();

        await expect(fetch(client, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('still answers empty on a failure that is not an abort', async () => {
        const client: any = { request: jest.fn(async () => { throw new TypeError('Failed to fetch'); }) };
        jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(fetch(client, new AbortController().signal)).resolves.toEqual({ rows: [], flattenedRows: [] });
    });
});

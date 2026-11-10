/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createGraphQLClient } from './graphql-client';
import { FetchError } from './fetch-error';

const url = 'https://example.test/graphql';

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sentInit = (call = 0): RequestInit => fetchMock.mock.calls[call][1] as RequestInit;
const sentHeaders = (call = 0): Record<string, string> => Object.fromEntries(new Headers(sentInit(call).headers).entries());

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => jsonResponse({ data: { rows: [] } }));
    globalThis.fetch = fetchMock;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('createGraphQLClient', () => {
    it('posts the document and variables as JSON and resolves to the data', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ data: { rows: [{ id: 1 }] } }));
        const client = createGraphQLClient(url);

        const data = await client.request('query Rows { rows { id } }', { limit: 1 });

        expect(data).toEqual({ rows: [{ id: 1 }] });
        expect(fetchMock.mock.calls[0][0]).toBe(url);
        expect(sentInit().method).toBe('POST');
        expect(JSON.parse(String(sentInit().body))).toEqual({ query: 'query Rows { rows { id } }', variables: { limit: 1 } });
        expect(sentHeaders()['content-type']).toBe('application/json');
    });

    // Regression: a request that carries no headers of its own — e.g. a filter
    // suggestion / autocomplete fetcher calling client.request directly before
    // any table fetch — must still get the resolved auth header.
    it('sends the resolved request headers with every request', async () => {
        const client = createGraphQLClient(url, () => ({ Authorization: 'Bearer t' }));

        await client.request('query A { a }');
        await client.request('query B { b }');

        expect(sentHeaders(0).authorization).toBe('Bearer t');
        expect(sentHeaders(1).authorization).toBe('Bearer t');
    });

    it('awaits an async requestHeaders function (proactive refresh) before each request', async () => {
        let token = 0;
        const requestHeaders = jest.fn(async () => ({ Authorization: `Bearer ${++token}` }));
        const client = createGraphQLClient(url, requestHeaders);

        await client.request('query A { a }');
        await client.request('query A { a }');

        expect(requestHeaders).toHaveBeenCalledTimes(2);
        expect(sentHeaders(0).authorization).toBe('Bearer 1');
        expect(sentHeaders(1).authorization).toBe('Bearer 2');
    });

    it('lets the host override a default header', async () => {
        const client = createGraphQLClient(url, { 'Content-Type': 'application/graphql+json', 'X-Keep': '1' });

        await client.request('query A { a }');

        expect(sentHeaders()['content-type']).toBe('application/graphql+json');
        expect(sentHeaders()['x-keep']).toBe('1');
    });

    it('fails with an internal FetchError when the requestHeaders function throws, without sending', async () => {
        const client = createGraphQLClient(url, () => { throw new TypeError("Cannot read properties of undefined (reading 'token')"); });

        await expect(client.request('query A { a }')).rejects.toMatchObject({ name: 'FetchError', info: { kind: 'internal' } });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects with the GraphQL errors even when data came along', async () => {
        const body = { data: { rows: null }, errors: [{ message: 'Could not verify JWT: JWTExpired', extensions: { code: 'invalid-jwt' } }] };
        fetchMock.mockResolvedValueOnce(jsonResponse(body));
        const client = createGraphQLClient(url);

        const error = await client.request('query A { a }').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).info).toEqual({ kind: 'unauthorized', message: 'Could not verify JWT: JWTExpired', status: 200, codes: ['invalid-jwt'] });
        expect((error as FetchError).cause).toEqual(body);
    });

    it('rejects a status other than success, with a body that is not JSON', async () => {
        fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
        const client = createGraphQLClient(url);

        const error = await client.request('query A { a }').catch((e: unknown) => e);

        expect((error as FetchError).info).toEqual({ kind: 'http', message: 'HTTP 502', status: 502 });
        expect((error as FetchError).cause).toBe('<html>Bad Gateway</html>');
    });

    it('resolves to undefined for a successful response without data', async () => {
        fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
        const client = createGraphQLClient(url);

        await expect(client.request('query A { a }')).resolves.toBeUndefined();
    });

    it('tells a request that got no response as a network failure', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const client = createGraphQLClient(url);

        await expect(client.request('query A { a }')).rejects.toMatchObject({ info: { kind: 'network', message: 'Failed to fetch' } });
    });

    it('passes the signal on and rejects with its reason when aborted', async () => {
        fetchMock.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }));
        const controller = new AbortController();
        const client = createGraphQLClient(url);

        const pending = client.request('query A { a }', {}, { signal: controller.signal });
        controller.abort();

        await expect(pending).rejects.toBe(controller.signal.reason);
        expect(sentInit().signal).toBe(controller.signal);
    });
});

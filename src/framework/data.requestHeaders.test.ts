import { resolveHeadersMiddleware } from './data';

// Minimal stand-in for graphql-request's RequestInitExtended.
function req(headers?: HeadersInit) {
    return { url: 'https://example.test/graphql', method: 'POST', body: '{}', headers } as unknown as Parameters<ReturnType<typeof resolveHeadersMiddleware>>[0];
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
    return Object.fromEntries(new Headers(headers).entries());
}

describe('resolveHeadersMiddleware', () => {
    // Regression: a request that carries no headers of its own — e.g. a filter
    // suggestion / autocomplete fetcher calling client.request directly before
    // any table fetch — must still get the resolved auth header. Previously the
    // header resolution lived only in the table-fetch wrapper, so these requests
    // went out unauthenticated.
    it('adds resolved headers to a request that had none', async () => {
        const mw = resolveHeadersMiddleware(() => ({ Authorization: 'Bearer t' }));
        const out = await mw(req());
        expect(headerRecord(out.headers).authorization).toBe('Bearer t');
    });

    it('awaits an async requestHeaders function (proactive refresh) before the request', async () => {
        const requestHeaders = jest.fn(async () => ({ Authorization: 'Bearer fresh' }));
        const mw = resolveHeadersMiddleware(requestHeaders);
        const out = await mw(req());
        expect(requestHeaders).toHaveBeenCalledTimes(1);
        expect(headerRecord(out.headers).authorization).toBe('Bearer fresh');
    });

    it('overrides a stale header of the same name and keeps unrelated ones', async () => {
        const mw = resolveHeadersMiddleware(() => ({ Authorization: 'Bearer new' }));
        const out = await mw(req({ Authorization: 'Bearer stale', 'X-Keep': '1' }));
        const h = headerRecord(out.headers);
        expect(h.authorization).toBe('Bearer new');
        expect(h['x-keep']).toBe('1');
    });

    it('preserves non-header request fields', async () => {
        const mw = resolveHeadersMiddleware(() => ({ Authorization: 'Bearer t' }));
        const out = await mw(req());
        expect(out.url).toBe('https://example.test/graphql');
        expect(out.method).toBe('POST');
        expect(out.body).toBe('{}');
    });

    it('passes the request through unchanged when no requestHeaders are given', async () => {
        const mw = resolveHeadersMiddleware(undefined);
        const input = req({ Authorization: 'Bearer keep' });
        const out = await mw(input);
        expect(out).toBe(input);
    });
});

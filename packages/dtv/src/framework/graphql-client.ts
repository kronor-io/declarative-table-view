import { FetchError, fetchErrorFromResponse, toFetchError } from './fetch-error';

// Headers sent with every GraphQL request. A function is re-evaluated (and
// awaited) before each request, so a host can hand back a freshly-refreshed
// short-lived token — synchronously from a cache, or asynchronously by calling
// a refresh endpoint.
export type RequestHeaders = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

export type GraphQLVariables = Record<string, unknown>;

/**
 * Sends GraphQL documents to the host's endpoint. The table uses it for its rows and lazy row
 * expansions, and hands it to suggestion fetchers.
 */
export interface GraphQLClient {
    /**
     * Posts the document and resolves to the response's `data`. Rejects with a `FetchError`
     * when the response has GraphQL errors, a status other than success, or does not arrive,
     * and with the signal's reason when the request is aborted.
     */
    request<Data = unknown>(document: string, variables?: GraphQLVariables, options?: { signal?: AbortSignal }): Promise<Data>;
}

async function resolveRequestHeaders(requestHeaders: RequestHeaders): Promise<HeadersInit> {
    try {
        return typeof requestHeaders === 'function' ? await requestHeaders() : requestHeaders;
    } catch (error) {
        // The host's code failed, not the network
        throw new FetchError({ kind: 'internal', message: `requestHeaders failed: ${error instanceof Error ? error.message : String(error)}` }, { cause: error });
    }
}

type GraphQLResponseBody = { data?: unknown; errors?: unknown };

// A body that is not JSON, e.g. a proxy's HTML error page, counts as no body
function parseBody(text: string): GraphQLResponseBody | undefined {
    try {
        const body: unknown = JSON.parse(text);
        return typeof body === 'object' && body !== null ? body as GraphQLResponseBody : undefined;
    } catch {
        return undefined;
    }
}

/**
 * A client for the GraphQL endpoint at `url`.
 *
 * `requestHeaders` is resolved before EVERY request the client makes — table fetches, lazy row
 * expansion, and the filter suggestion/autocomplete fetchers that call `client.request`
 * directly — each with a freshly-resolved token. That is what lets a host keep a short-lived
 * token fresh proactively: it resolves (and, if needed, refreshes) the token immediately before
 * each request. A token refreshed ahead of expiry never produces an auth error, so there is
 * deliberately no reactive retry; a genuinely dead session surfaces as a normal GraphQL error
 * for the host to handle (e.g. reload to login).
 */
export function createGraphQLClient(url: string, requestHeaders?: RequestHeaders): GraphQLClient {
    return {
        async request<Data = unknown>(document: string, variables?: GraphQLVariables, options?: { signal?: AbortSignal }): Promise<Data> {
            const signal = options?.signal;
            const headers = new Headers({
                'Content-Type': 'application/json',
                Accept: 'application/graphql-response+json, application/json'
            });
            if (requestHeaders !== undefined) {
                new Headers(await resolveRequestHeaders(requestHeaders)).forEach((value, key) => {
                    headers.set(key, value);
                });
            }

            let response: Response;
            let text: string;
            try {
                response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: document, variables }), signal });
                text = await response.text();
            } catch (error) {
                signal?.throwIfAborted();
                throw toFetchError(error);
            }

            const body = parseBody(text);
            const errors = Array.isArray(body?.errors) ? body.errors : [];
            if (!response.ok || errors.length > 0) {
                throw fetchErrorFromResponse(response.status, errors, { cause: body ?? text });
            }
            return body?.data as Data;
        }
    };
}

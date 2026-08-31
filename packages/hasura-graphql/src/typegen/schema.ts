// Fetching a GraphQL schema by introspection.
import { buildClientSchema, getIntrospectionQuery, type GraphQLSchema } from 'graphql';

export type FetchSchemaOptions = {
    endpoint: string;
    headers?: Record<string, string>;
    /** Defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
};

export async function fetchSchema(options: FetchSchemaOptions): Promise<GraphQLSchema> {
    const doFetch = options.fetchImpl ?? fetch;
    const query = getIntrospectionQuery({ descriptions: true });

    const res = await doFetch(options.endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(options.headers ?? {})
        },
        body: JSON.stringify({ query })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Introspection request failed (${res.status} ${res.statusText}): ${text}`);
    }

    const json = await res.json() as any;
    if (json.errors && Array.isArray(json.errors) && json.errors.length) {
        throw new Error(`Introspection returned errors: ${JSON.stringify(json.errors, null, 2)}`);
    }
    if (!json.data) {
        throw new Error('Introspection response missing data');
    }

    return buildClientSchema(json.data);
}

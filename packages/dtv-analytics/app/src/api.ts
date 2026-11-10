/*
 * What the app asks: the server's API (credentials, fetches), and the store through its Hasura.
 */

export type SourceInfo = {
    name: string;
    endpoint: string;
    /** The server can make requests to the source, or needs credentials first. */
    connected: boolean;
    /** The store's GraphQL endpoint. */
    store: string | null;
};

export type Credentials = {
    token?: string;
    cfAccessClientId?: string;
    cfAccessClientSecret?: string;
    cfAuthorization?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
    if (!response.ok) {
        throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
}

export const getSource = () => api<SourceInfo>('/api/source');

export const connect = (credentials: Credentials) =>
    api<void>('/api/connect', { method: 'POST', body: JSON.stringify(credentials) });

/** Asks for the events stored from `from` until before `to`; resolves to the fetch's id. */
export const fetchEvents = (from: Date, to: Date) =>
    api<{ fetchId: number }>('/api/fetch/events', { method: 'POST', body: JSON.stringify({ from, to }) }).then(r => r.fetchId);

/** Asks for users' stored data; `maxAgeSeconds: 0` fetches it again however recent it is. */
export const fetchUserData = (maxAgeSeconds?: number) =>
    api<{ fetchId: number }>('/api/fetch/user-data', { method: 'POST', body: JSON.stringify({ maxAgeSeconds }) }).then(r => r.fetchId);

/** A query to the store's Hasura. */
export async function storeQuery<T>(store: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(store, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    const result = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (result.errors !== undefined || result.data === undefined) {
        throw new Error(result.errors?.map(e => e.message).join('; ') ?? `HTTP ${response.status}`);
    }
    return result.data;
}

export type FetchJob = {
    id: string;
    kind: 'events' | 'userData';
    state: 'queued' | 'running' | 'done' | 'failed';
    rows: number;
    pages: number;
    error: string | null;
};

/** Resolves when the fetch is done or failed, telling `progress` how far it got meanwhile. */
export async function waitForFetch(store: string, fetchId: number, progress: (job: FetchJob) => void): Promise<FetchJob> {
    for (;;) {
        const { fetchJobByPk: job } = await storeQuery<{ fetchJobByPk: FetchJob | null }>(
            store,
            'query FetchJob($id: bigint!) { fetchJobByPk(id: $id) { id kind state rows pages error } }',
            { id: fetchId },
        );
        if (job !== null) {
            progress(job);
            if (job.state === 'done' || job.state === 'failed') return job;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

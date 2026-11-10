/*
 * Why a request for a table's rows failed, told apart well enough to act on: a query that
 * times out wants narrower filters, a rejected token a new session, a GraphQL error a fix
 * in the view or the API.
 */

/** What kind of failure a `FetchError` is. */
export type FetchErrorKind =
    /** The database cancelled the query, e.g. on its statement timeout, or a gateway timed out. */
    | 'timeout'
    /** HTTP 401 or 403, or the API rejected the token or the role. */
    | 'unauthorized'
    /** The response carried GraphQL errors, e.g. a field the role may not read. */
    | 'graphql'
    /** An HTTP status other than success, without GraphQL errors. */
    | 'http'
    /** No response arrived: offline, DNS, CORS, a dropped connection. */
    | 'network'
    /** A response without the view's root field. */
    | 'unexpectedResponse'
    /** Anything else, e.g. building the query's variables or flattening the rows threw. */
    | 'internal';

export type FetchErrorInfo = {
    readonly kind: FetchErrorKind;
    readonly message: string;
    /** The HTTP status, when a response arrived. */
    readonly status?: number;
    /** The `extensions.code` of each GraphQL error, e.g. `validation-failed` or `invalid-jwt` from Hasura. */
    readonly codes?: readonly string[];
};

/** A failed request for a table's rows. Aborted requests reject with an AbortError instead. */
export class FetchError extends Error {
    readonly info: FetchErrorInfo;
    /** The error the failure was told from. */
    readonly cause: unknown;

    constructor(info: FetchErrorInfo, options?: { cause?: unknown }) {
        super(info.message);
        this.name = 'FetchError';
        this.info = info;
        this.cause = options?.cause;
    }
}

// Hasura's codes for a token or role it does not accept
const unauthorizedCodes = new Set(['invalid-jwt', 'jwt-invalid-claims', 'jwt-missing-role-claims', 'access-denied', 'invalid-headers']);

const timeoutMessage = /statement timeout|canceling statement|query timed out/i;

// Chrome, Firefox, Safari and Node
const networkFailure = /failed to fetch|networkerror|load failed|fetch failed|network request failed/i;

/** The parts of a GraphQL error read here. */
type GraphQLErrorLike = { message?: unknown; extensions?: { code?: unknown } };

// An entry of a response's `errors`, which arrive unchecked from the server
const asGraphQLError = (error: unknown): GraphQLErrorLike => {
    if (typeof error !== 'object' || error === null) return {};
    const { message, extensions } = error as { message?: unknown; extensions?: unknown };
    return { message, extensions: typeof extensions === 'object' && extensions !== null ? extensions as { code?: unknown } : undefined };
};

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Tells what kind of failure a response with a status other than success, or with GraphQL errors, is. */
export function fetchErrorFromResponse(status: number, errors: readonly unknown[], options?: { cause?: unknown }): FetchError {
    const graphQLErrors = errors.map(asGraphQLError);
    const messages = graphQLErrors.map(graphQLError => typeof graphQLError.message === 'string' ? graphQLError.message : '').filter(Boolean);
    const codes = graphQLErrors.flatMap(graphQLError => typeof graphQLError.extensions?.code === 'string' ? [graphQLError.extensions.code] : []);
    const message = messages.length > 0 ? messages.join('; ') : `HTTP ${status}`;
    const kind: FetchErrorKind =
        status === 504 || messages.some(text => timeoutMessage.test(text)) ? 'timeout'
            : status === 401 || status === 403 || codes.some(code => unauthorizedCodes.has(code)) ? 'unauthorized'
                : errors.length > 0 ? 'graphql'
                    : 'http';
    return new FetchError({ kind, message, status, ...(codes.length > 0 ? { codes } : {}) }, options);
}

/** Tells what kind of failure an error a request rejected with is, keeping a `FetchError` as it is. */
export function toFetchError(error: unknown): FetchError {
    if (error instanceof FetchError) return error;

    // fetch rejects with a TypeError when no response arrives, saying so in each browser's words;
    // other TypeErrors are code that failed
    if (error instanceof TypeError && networkFailure.test(error.message)) {
        return new FetchError({ kind: 'network', message: error.message }, { cause: error });
    }

    return new FetchError({ kind: 'internal', message: messageOf(error) }, { cause: error });
}

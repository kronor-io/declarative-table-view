import { describe, it, expect } from '@jest/globals';

import { FetchError, fetchErrorFromClientError } from './fetch-error';

/** What graphql-request's ClientError carries. */
const clientError = (status: number, errors?: Array<{ message: string; extensions?: { code: string } }>) =>
    Object.assign(new Error('GraphQL Error'), { response: { status, errors } });

describe('fetchErrorFromClientError', () => {
    it('tells a query the database cancelled as a timeout', () => {
        const error = fetchErrorFromClientError(clientError(200, [
            { message: 'canceling statement due to statement timeout', extensions: { code: 'postgres-error' } }
        ]));

        expect(error.info).toEqual({
            kind: 'timeout',
            message: 'canceling statement due to statement timeout',
            status: 200,
            codes: ['postgres-error']
        });
    });

    it('tells a gateway timeout as a timeout', () => {
        expect(fetchErrorFromClientError(clientError(504)).info.kind).toBe('timeout');
    });

    it('tells a rejected token or role as unauthorized', () => {
        expect(fetchErrorFromClientError(clientError(200, [
            { message: 'Could not verify JWT: JWTExpired', extensions: { code: 'invalid-jwt' } }
        ])).info.kind).toBe('unauthorized');
        expect(fetchErrorFromClientError(clientError(401)).info.kind).toBe('unauthorized');
    });

    it('tells other GraphQL errors apart from HTTP errors without them', () => {
        const graphql = fetchErrorFromClientError(clientError(200, [
            { message: "field 'amount' not found in type: 'payments'", extensions: { code: 'validation-failed' } },
            { message: 'a second one' }
        ]));

        expect(graphql.info).toMatchObject({
            kind: 'graphql',
            message: "field 'amount' not found in type: 'payments'; a second one",
            codes: ['validation-failed']
        });
        expect(fetchErrorFromClientError(clientError(502)).info).toEqual({ kind: 'http', message: 'HTTP 502', status: 502 });
    });

    it('tells a request that got no response as a network failure', () => {
        expect(fetchErrorFromClientError(new TypeError('Failed to fetch')).info).toEqual({ kind: 'network', message: 'Failed to fetch' });
        expect(fetchErrorFromClientError(new TypeError('NetworkError when attempting to fetch resource.')).info.kind).toBe('network');
        expect(fetchErrorFromClientError(new TypeError('Load failed')).info.kind).toBe('network');
    });

    it('tells code that failed apart from the network', () => {
        expect(fetchErrorFromClientError(new TypeError("Cannot read properties of undefined (reading 'token')")).info.kind).toBe('internal');
    });

    it('keeps the error it was told from, and passes a FetchError through', () => {
        const cause = new Error('something else');
        const error = fetchErrorFromClientError(cause);

        expect(error).toBeInstanceOf(FetchError);
        expect(error.info).toEqual({ kind: 'internal', message: 'something else' });
        expect(error.cause).toBe(cause);
        expect(fetchErrorFromClientError(error)).toBe(error);
    });
});

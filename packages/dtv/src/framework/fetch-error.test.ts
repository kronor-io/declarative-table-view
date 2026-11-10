import { describe, it, expect } from '@jest/globals';

import { FetchError, fetchErrorFromResponse, toFetchError } from './fetch-error';

describe('fetchErrorFromResponse', () => {
    it('tells a query the database cancelled as a timeout', () => {
        const error = fetchErrorFromResponse(200, [
            { message: 'canceling statement due to statement timeout', extensions: { code: 'postgres-error' } }
        ]);

        expect(error.info).toEqual({
            kind: 'timeout',
            message: 'canceling statement due to statement timeout',
            status: 200,
            codes: ['postgres-error']
        });
    });

    it('tells a gateway timeout as a timeout', () => {
        expect(fetchErrorFromResponse(504, []).info.kind).toBe('timeout');
    });

    it('tells a rejected token or role as unauthorized', () => {
        expect(fetchErrorFromResponse(200, [
            { message: 'Could not verify JWT: JWTExpired', extensions: { code: 'invalid-jwt' } }
        ]).info.kind).toBe('unauthorized');
        expect(fetchErrorFromResponse(401, []).info.kind).toBe('unauthorized');
    });

    it('tells other GraphQL errors apart from HTTP errors without them', () => {
        const graphql = fetchErrorFromResponse(200, [
            { message: "field 'amount' not found in type: 'payments'", extensions: { code: 'validation-failed' } },
            { message: 'a second one' }
        ]);

        expect(graphql.info).toMatchObject({
            kind: 'graphql',
            message: "field 'amount' not found in type: 'payments'; a second one",
            codes: ['validation-failed']
        });
        expect(fetchErrorFromResponse(502, []).info).toEqual({ kind: 'http', message: 'HTTP 502', status: 502 });
    });

    it('reads errors of any shape the server sends', () => {
        const error = fetchErrorFromResponse(200, [null, 'text', { message: 42, extensions: { code: 7 } }, { message: 'readable' }]);

        expect(error.info).toEqual({ kind: 'graphql', message: 'readable', status: 200 });
    });

    it('keeps the cause it is given', () => {
        const body = { errors: [{ message: 'x' }] };

        expect(fetchErrorFromResponse(200, body.errors, { cause: body }).cause).toBe(body);
    });
});

describe('toFetchError', () => {
    it('tells a request that got no response as a network failure', () => {
        expect(toFetchError(new TypeError('Failed to fetch')).info).toEqual({ kind: 'network', message: 'Failed to fetch' });
        expect(toFetchError(new TypeError('NetworkError when attempting to fetch resource.')).info.kind).toBe('network');
        expect(toFetchError(new TypeError('Load failed')).info.kind).toBe('network');
    });

    it('tells code that failed apart from the network', () => {
        expect(toFetchError(new TypeError("Cannot read properties of undefined (reading 'token')")).info.kind).toBe('internal');
    });

    it('keeps the error it was told from, and passes a FetchError through', () => {
        const cause = new Error('something else');
        const error = toFetchError(cause);

        expect(error).toBeInstanceOf(FetchError);
        expect(error.info).toEqual({ kind: 'internal', message: 'something else' });
        expect(error.cause).toBe(cause);
        expect(toFetchError(error)).toBe(error);
    });
});

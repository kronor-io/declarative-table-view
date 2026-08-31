import { describe, it, expect } from '@jest/globals';

// Mock ESM-only graphql-request before importing lib entry (which re-exports App).
jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

import * as API from './index';

describe('lib exports', () => {
    it('exposes DSL as DTV helpers', () => {
        const { DSL: DTV } = API;
        expect(typeof DTV.column).toBe('function');
        expect(typeof DTV.valueQuery).toBe('function');
        expect(typeof DTV.runtimeRef).toBe('function');
        expect(typeof DTV.filter).toBe('function');
        expect(typeof DTV.view).toBe('function');
        expect(typeof DTV.CellRenderer.text).toBe('function');
        expect(typeof DTV.CellRenderer.json).toBe('function');
    });

    it('exposes built-in cell renderers', () => {
        expect(typeof API.CellRenderer.text).toBe('function');
        expect(typeof API.CellRenderer.json).toBe('function');
    });

    it('exposes framework filterExpr helpers', () => {
        expect(typeof API.FilterExpr.equals).toBe('function');
        expect(typeof API.FilterExpr.and).toBe('function');
        expect(Array.isArray(API.FilterExpr.allOperators)).toBe(true);
    });

    it('does not expose Hasura and exposes hasuraDSLforRowType instead', () => {
        expect('Hasura' in API).toBe(false);
        expect(typeof API.hasuraDSLforRowType).toBe('function');
    });
});

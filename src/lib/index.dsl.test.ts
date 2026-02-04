import { describe, it, expect } from '@jest/globals';

// Mock ESM-only graphql-request before importing lib entry (which re-exports App).
jest.mock('graphql-request', () => {
    return {
        GraphQLClient: jest.fn().mockImplementation(() => ({
            request: jest.fn(async () => ({}))
        }))
    };
}, { virtual: true });

import { DSL as DTV, CellRenderer, FilterExpr } from './index';

describe('lib exports', () => {
    it('exposes DSL as DTV helpers', () => {
        expect(typeof DTV.column).toBe('function');
        expect(typeof DTV.valueQuery).toBe('function');
        expect(typeof DTV.runtimeRef).toBe('function');
        expect(typeof DTV.filter).toBe('function');
        expect(typeof DTV.view).toBe('function');
        expect(typeof DTV.CellRenderer.text).toBe('function');
        expect(typeof DTV.CellRenderer.json).toBe('function');
    });

    it('exposes built-in cell renderers', () => {
        expect(typeof CellRenderer.text).toBe('function');
        expect(typeof CellRenderer.json).toBe('function');
    });

    it('exposes framework filterExpr helpers', () => {
        expect(typeof FilterExpr.equals).toBe('function');
        expect(typeof FilterExpr.and).toBe('function');
        expect(Array.isArray(FilterExpr.allOperators)).toBe(true);
    });
});

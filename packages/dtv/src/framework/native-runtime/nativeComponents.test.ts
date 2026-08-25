import { describe, it, expect } from '@jest/globals';
import { nativeRuntime } from './index';
import { TableColumnDefinition } from '../column-definition';

describe('NativeRuntime', () => {
    describe('nativeRuntime', () => {
        it('has the correct ViewRuntime structure', () => {
            expect(nativeRuntime).toHaveProperty('cellRenderers');
            expect(nativeRuntime.cellRenderers).toHaveProperty('text');
            expect(nativeRuntime.cellRenderers).toHaveProperty('json');
        });

        it('exports text and json cell renderers', () => {
            expect(nativeRuntime.cellRenderers.text).toBeDefined();
            expect(typeof nativeRuntime.cellRenderers.text).toBe('function');
            expect(nativeRuntime.cellRenderers.json).toBeDefined();
            expect(typeof nativeRuntime.cellRenderers.json).toBe('function');
        });

        it('has all required runtime sections', () => {
            expect(nativeRuntime).toHaveProperty('cellRenderers');
            expect(nativeRuntime).toHaveProperty('queryTransforms');
            expect(nativeRuntime).toHaveProperty('noRowsComponents');
            expect(nativeRuntime).toHaveProperty('customFilterComponents');
            expect(nativeRuntime).toHaveProperty('initialValues');
        });
    });

    describe('text cell renderer (valueQuery + chain introspection)', () => {
        const textRenderer = nativeRuntime.cellRenderers.text;

        it('returns empty string when columnDefinition has zero or multiple queries', () => {
            const emptyCol: TableColumnDefinition = { type: 'tableColumn', id: 'empty', name: 'Empty', data: [], cellRenderer: () => null };
            expect(textRenderer({ data: { any: 'value' }, columnDefinition: emptyCol })).toBe('');
            const multiCol: TableColumnDefinition = { type: 'tableColumn', id: 'multi', name: 'Multi', data: [{ type: 'valueQuery', field: 'a' }, { type: 'valueQuery', field: 'b' }] as any, cellRenderer: () => null };
            expect(textRenderer({ data: { a: 1, b: 2 }, columnDefinition: multiCol })).toBe('');
        });

        it('renders valueQuery scalar', () => {
            const col: TableColumnDefinition = { type: 'tableColumn', id: 'name', name: 'Name', data: [{ type: 'valueQuery', field: 'name' }] as any, cellRenderer: () => null };
            expect(textRenderer({ data: { name: 'John', age: 30 }, columnDefinition: col })).toBe('John');
            expect(textRenderer({ data: { age: 30 }, columnDefinition: col })).toBe('');
        });

        it('renders objectQuery single leaf value', () => {
            const col: TableColumnDefinition = { type: 'tableColumn', id: 'user', name: 'User', data: [{ type: 'objectQuery', field: 'user', selectionSet: [{ type: 'valueQuery', field: 'name' }] }] as any, cellRenderer: () => null };
            expect(textRenderer({ data: { user: { name: 'Alice', age: 30 } }, columnDefinition: col })).toBe('Alice');
        });

        it('returns empty string for branching objectQuery selectionSet', () => {
            const col: TableColumnDefinition = { type: 'tableColumn', id: 'user-branch', name: 'User', data: [{ type: 'objectQuery', field: 'user', selectionSet: [{ type: 'valueQuery', field: 'name' }, { type: 'valueQuery', field: 'email' }] }] as any, cellRenderer: () => null };
            expect(textRenderer({ data: { user: { name: 'Alice', email: 'a@example.com' } }, columnDefinition: col })).toBe('');
        });

        it('returns empty string for arrayQuery selectionSet', () => {
            const col: TableColumnDefinition = { type: 'tableColumn', id: 'items', name: 'Items', data: [{ type: 'arrayQuery', field: 'items', selectionSet: [{ type: 'valueQuery', field: 'label' }, { type: 'valueQuery', field: 'id' }] }] as any, cellRenderer: () => null };
            expect(textRenderer({ data: { items: [{ label: 'first', id: 1 }] }, columnDefinition: col })).toBe('');
        });

        it('returns empty string for unsupported query types (e.g. invalid)', () => {
            const col: TableColumnDefinition = { type: 'tableColumn', id: 'legacy', name: 'Legacy', data: [{ type: 'invalid', field: 'name' }] as any, cellRenderer: () => null };
            expect(textRenderer({ data: { name: 'John' }, columnDefinition: col })).toBe('');
        });
    });

    describe('json cell renderer', () => {
        const jsonRenderer = nativeRuntime.cellRenderers.json;

        it('serializes primitive values', () => {
            expect(jsonRenderer({ data: 'hello' })).toBe('"hello"');
            expect(jsonRenderer({ data: 123 })).toBe('123');
            expect(jsonRenderer({ data: true })).toBe('true');
            expect(jsonRenderer({ data: false })).toBe('false');
        });

        it('handles null and undefined', () => {
            expect(jsonRenderer({ data: null })).toBe('null');
            expect(jsonRenderer({ data: undefined })).toBe(undefined);
        });

        it('serializes objects', () => {
            const obj = { name: 'John', age: 30 };
            expect(jsonRenderer({ data: obj })).toBe('{"name":"John","age":30}');
        });

        it('serializes arrays', () => {
            const arr = ['apple', 'banana', 'orange'];
            expect(jsonRenderer({ data: arr })).toBe('["apple","banana","orange"]');
        });

        it('handles empty objects and arrays', () => {
            expect(jsonRenderer({ data: {} })).toBe('{}');
            expect(jsonRenderer({ data: [] })).toBe('[]');
        });

        it('handles nested structures', () => {
            const nested = {
                user: { name: 'Alice', preferences: ['dark', 'compact'] },
                settings: { theme: 'dark', notifications: true }
            };
            const expected = '{"user":{"name":"Alice","preferences":["dark","compact"]},"settings":{"theme":"dark","notifications":true}}';
            expect(jsonRenderer({ data: nested })).toBe(expected);
        });
    });
});

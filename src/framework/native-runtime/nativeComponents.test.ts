import { describe, it, expect } from '@jest/globals';
import { nativeRuntime } from './index';

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

    describe('text cell renderer', () => {
        const textRenderer = nativeRuntime.cellRenderers.text;

        it('returns empty string for primitive values', () => {
            expect(textRenderer({ data: 'hello' })).toBe('');
            expect(textRenderer({ data: 123 })).toBe('');
            expect(textRenderer({ data: true })).toBe('');
            expect(textRenderer({ data: false })).toBe('');
        });

        it('returns empty string for null and undefined', () => {
            expect(textRenderer({ data: null })).toBe('');
            expect(textRenderer({ data: undefined })).toBe('');
        });

        it('extracts first property value from objects', () => {
            expect(textRenderer({ data: { name: 'John', age: 30 } })).toBe('John');
            expect(textRenderer({ data: { id: 42 } })).toBe('42');
            expect(textRenderer({ data: { active: true } })).toBe('true');
        });

        it('returns empty string for objects with null/undefined first value', () => {
            expect(textRenderer({ data: { name: null, age: 30 } })).toBe('');
            expect(textRenderer({ data: { name: undefined, age: 30 } })).toBe('');
        });

        it('returns empty string for empty objects', () => {
            expect(textRenderer({ data: {} })).toBe('');
        });

        it('handles arrays as objects', () => {
            expect(textRenderer({ data: ['first', 'second'] })).toBe('first');
            expect(textRenderer({ data: [] })).toBe('');
        });

        it('converts nested objects to string', () => {
            const nestedData = { user: { name: 'Alice', id: 1 } };
            expect(textRenderer({ data: nestedData })).toBe('[object Object]');
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

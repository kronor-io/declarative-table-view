import { parseFilterControlJson, parseInitialValue } from './view-parser';
import type { Runtime } from './runtime';

describe('FilterControlJson initialValue runtime reference parsing', () => {
    const testRuntime: Runtime = {
        cellRenderers: {},
        queryTransforms: {},
        noRowsComponents: {},
        customFilterComponents: {},
        initialValues: {
            defaultEmail: 'admin@example.com',
            defaultAge: 25,
            defaultTags: ['admin', 'user'],
            defaultConfig: { theme: 'dark', layout: 'grid' }
        },
        suggestionFetchers: {}
    };

    const externalRuntime: Runtime = {
        cellRenderers: {},
        queryTransforms: {},
        noRowsComponents: {},
        customFilterComponents: {},
        initialValues: {
            defaultEmail: 'external@example.com', // Should override built-in runtime
            externalValue: 'external-only'
        },
        suggestionFetchers: {}
    };

    describe('parseInitialValue', () => {
        it('should return primitive values as-is', () => {
            expect(parseInitialValue('test', testRuntime)).toBe('test');
            expect(parseInitialValue(42, testRuntime)).toBe(42);
            expect(parseInitialValue(true, testRuntime)).toBe(true);
            expect(parseInitialValue(null, testRuntime)).toBe(null);
            expect(parseInitialValue(undefined, testRuntime)).toBe(undefined);
        });

        it('should return regular objects as-is', () => {
            const obj = { name: 'test', value: 123 };
            expect(parseInitialValue(obj, testRuntime)).toBe(obj);
        });

        it('should resolve runtime references from initialValues section', () => {
            const ref = { section: 'initialValues', key: 'defaultEmail' };
            expect(parseInitialValue(ref, testRuntime)).toBe('admin@example.com');
        });

        it('should resolve complex values from runtime references', () => {
            const ref = { section: 'initialValues', key: 'defaultTags' };
            expect(parseInitialValue(ref, testRuntime)).toEqual(['admin', 'user']);
        });

        it('should prefer external runtime over built-in runtime', () => {
            const ref = { section: 'initialValues', key: 'defaultEmail' };
            expect(parseInitialValue(ref, testRuntime, externalRuntime)).toBe('external@example.com');
        });

        it('should resolve from external runtime when key only exists there', () => {
            const ref = { section: 'initialValues', key: 'externalValue' };
            expect(parseInitialValue(ref, testRuntime, externalRuntime)).toBe('external-only');
        });

        it('should throw error for non-existent runtime reference keys', () => {
            const ref = { section: 'initialValues', key: 'nonexistent' };

            expect(() => parseInitialValue(ref, testRuntime)).toThrow(
                'Reference "nonexistent" not found in initialValues'
            );
        });

        it('should return runtime references with non-initialValues sections as-is', () => {
            const ref = { section: 'cellRenderers', key: 'someRenderer' };
            expect(parseInitialValue(ref, testRuntime)).toBe(ref);
        });

        it('should handle objects that look like runtime references but fail parsing', () => {
            const notARef = { section: 123, key: 'test' }; // Invalid section type
            expect(parseInitialValue(notARef, testRuntime)).toBe(notARef);
        });
    });

    describe('parseFilterControlJson with initialValue runtime references', () => {
        it('should parse text control with runtime reference initialValue', () => {
            const json = {
                type: 'text',
                label: 'Email',
                initialValue: { section: 'initialValues', key: 'defaultEmail' }
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'text',
                label: 'Email',
                initialValue: 'admin@example.com'
            });
        });

        it('should parse dropdown control with runtime reference initialValue', () => {
            const json = {
                type: 'dropdown',
                label: 'Age',
                items: [
                    { label: '18-25', value: 25 },
                    { label: '26-35', value: 30 }
                ],
                initialValue: { section: 'initialValues', key: 'defaultAge' }
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'dropdown',
                label: 'Age',
                items: [
                    { label: '18-25', value: 25 },
                    { label: '26-35', value: 30 }
                ],
                initialValue: 25
            });
        });

        it('should parse multiselect control with array runtime reference initialValue', () => {
            const json = {
                type: 'multiselect',
                label: 'Tags',
                items: [
                    { label: 'Admin', value: 'admin' },
                    { label: 'User', value: 'user' }
                ],
                initialValue: { section: 'initialValues', key: 'defaultTags' }
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'multiselect',
                label: 'Tags',
                items: [
                    { label: 'Admin', value: 'admin' },
                    { label: 'User', value: 'user' }
                ],
                initialValue: ['admin', 'user']
            });
        });

        it('should parse customOperator control with runtime reference initialValue', () => {
            const json = {
                type: 'customOperator',
                operators: [{ label: 'Equals', value: 'eq' }],
                valueControl: { type: 'text' },
                initialValue: { section: 'initialValues', key: 'defaultConfig' }
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'customOperator',
                operators: [{ label: 'Equals', value: 'eq' }],
                valueControl: { type: 'text', initialValue: undefined },
                initialValue: { theme: 'dark', layout: 'grid' }
            });
        });

        it('should handle nested customOperator with runtime references in valueControl', () => {
            const json = {
                type: 'customOperator',
                operators: [{ label: 'Equals', value: 'eq' }],
                valueControl: {
                    type: 'text',
                    initialValue: { section: 'initialValues', key: 'defaultEmail' }
                },
                initialValue: { section: 'initialValues', key: 'defaultAge' }
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'customOperator',
                operators: [{ label: 'Equals', value: 'eq' }],
                valueControl: {
                    type: 'text',
                    initialValue: 'admin@example.com'
                },
                initialValue: 25
            });
        });

        it('should preserve non-runtime-reference initialValues', () => {
            const json = {
                type: 'text',
                label: 'Name',
                initialValue: 'static value'
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'text',
                label: 'Name',
                initialValue: 'static value'
            });
        });

        it('should handle missing initialValue', () => {
            const json = {
                type: 'text',
                label: 'Name'
            };

            const result = parseFilterControlJson(json, testRuntime);
            expect(result).toEqual({
                type: 'text',
                label: 'Name',
                initialValue: undefined
            });
        });

        it('should prefer external runtime for initialValue resolution', () => {
            const json = {
                type: 'text',
                label: 'Email',
                initialValue: { section: 'initialValues', key: 'defaultEmail' }
            };

            const result = parseFilterControlJson(json, testRuntime, externalRuntime);
            expect(result).toEqual({
                type: 'text',
                label: 'Email',
                initialValue: 'external@example.com'
            });
        });
    });
});

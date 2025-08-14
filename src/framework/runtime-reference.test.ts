import { parseRuntimeReference, parseColumnDefinitionJson } from './view-parser';

describe('RuntimeReference', () => {
    describe('parseRuntimeReference', () => {
        it('should parse valid RuntimeReference object', () => {
            const json = {
                section: 'cellRenderers',
                key: 'myRenderer'
            };

            const result = parseRuntimeReference(json);
            expect(result).toEqual({
                section: 'cellRenderers',
                key: 'myRenderer'
            });
        });

        it('should validate section values', () => {
            const json = {
                section: 'invalidSection',
                key: 'myRenderer'
            };

            expect(() => {
                parseRuntimeReference(json);
            }).toThrow('Invalid RuntimeReference: "section" must be one of: cellRenderers, noRowsComponents, customFilterComponents, queryTransforms');
        });

        it('should validate that section is a string', () => {
            const json = {
                section: 123,
                key: 'myRenderer'
            };

            expect(() => {
                parseRuntimeReference(json);
            }).toThrow('Invalid RuntimeReference: "section" must be a string');
        });

        it('should validate that key is a string', () => {
            const json = {
                section: 'cellRenderers',
                key: 123
            };

            expect(() => {
                parseRuntimeReference(json);
            }).toThrow('Invalid RuntimeReference: "key" must be a string');
        });

        it('should require section field', () => {
            const json = {
                key: 'myRenderer'
            };

            expect(() => {
                parseRuntimeReference(json);
            }).toThrow('Invalid RuntimeReference: "section" must be a string');
        });

        it('should require key field', () => {
            const json = {
                section: 'cellRenderers'
            };

            expect(() => {
                parseRuntimeReference(json);
            }).toThrow('Invalid RuntimeReference: "key" must be a string');
        });
    });

    describe('ColumnDefinitionJson with RuntimeReference', () => {
        const testRuntime = {
            cellRenderers: {
                myRenderer: () => 'test',
                otherRenderer: () => 'other'
            }
        };

        it('should parse column with RuntimeReference format', () => {
            const json = {
                data: [{ type: 'field', path: 'test' }],
                name: 'Test Column',
                cellRenderer: {
                    section: 'cellRenderers',
                    key: 'myRenderer'
                }
            };

            const result = parseColumnDefinitionJson(json, testRuntime);
            expect(result.cellRenderer.section).toBe('cellRenderers');
            expect(result.cellRenderer.key).toBe('myRenderer');
        });

        it('should require cellRenderer field', () => {
            const json = {
                data: [{ type: 'field', path: 'test' }],
                name: 'Test Column'
                // Missing cellRenderer
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime);
            }).toThrow('Invalid JSON: "cellRenderer" field is required');
        });

        it('should validate cellRenderer section is cellRenderers', () => {
            const json = {
                data: [{ type: 'field', path: 'test' }],
                name: 'Test Column',
                cellRenderer: {
                    section: 'queryTransforms',
                    key: 'myRenderer'
                }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime);
            }).toThrow('Invalid cellRenderer: section must be "cellRenderers"');
        });

        it('should validate cellRenderer reference key exists in runtime', () => {
            const json = {
                data: [{ type: 'field', path: 'test' }],
                name: 'Test Column',
                cellRenderer: {
                    section: 'cellRenderers',
                    key: 'nonExistentRenderer'
                }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime);
            }).toThrow('Invalid cellRenderer reference: "nonExistentRenderer". Valid keys are: myRenderer, otherRenderer');
        });
    });

    describe('Custom Filter Component RuntimeReference', () => {
        const testRuntime = {
            customFilterComponents: {
                phoneNumberFilter: () => 'PhoneNumberFilter',
                emailFilter: () => 'EmailFilter'
            }
        };

        it('should resolve custom filter component with RuntimeReference', () => {
            // This would be tested as part of filter parsing, but we can test the concept
            const runtimeRef = {
                section: 'customFilterComponents' as const,
                key: 'phoneNumberFilter'
            };

            const parsed = parseRuntimeReference(runtimeRef);
            expect(parsed).toEqual({
                section: 'customFilterComponents',
                key: 'phoneNumberFilter'
            });

            // Verify the key exists in runtime
            expect(testRuntime.customFilterComponents[parsed.key as keyof typeof testRuntime.customFilterComponents]).toBeDefined();
        });
    });
});

import { parseColumnDefinitionJson, parseFilterFieldSchemaJson, parseViewJson } from './view-parser';
import { Runtime } from './runtime';

describe('parseColumnDefinitionJson', () => {
    const testRuntime: Runtime = {
        cellRenderers: {
            name: () => 'test',
            email: () => 'test',
            status: () => 'test',
            amount: () => 'test'
        },
        queryTransforms: {},
        noRowsComponents: {},
        customFilterComponents: {}
    };

    describe('successful parsing', () => {
        it('should parse valid JSON with single data field', () => {
            const json = {
                data: [{ type: 'field', path: 'user.name' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);

            expect(result).toEqual({
                data: [{ type: 'field', path: 'user.name' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            });
        });

        it('should parse valid JSON with multiple data fields', () => {
            const json = {
                data: [
                    { type: 'field', path: 'user.firstName' },
                    { type: 'field', path: 'user.lastName' }
                ],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);

            expect(result).toEqual({
                data: [
                    { type: 'field', path: 'user.firstName' },
                    { type: 'field', path: 'user.lastName' }
                ],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            });
        });

        it('should parse valid JSON with different cell renderer keys', () => {
            const testCases = [
                { cellRenderer: { section: 'cellRenderers', key: 'email' }, expected: 'email' },
                { cellRenderer: { section: 'cellRenderers', key: 'status' }, expected: 'status' },
                { cellRenderer: { section: 'cellRenderers', key: 'amount' }, expected: 'amount' }
            ];

            testCases.forEach(({ cellRenderer, expected }) => {
                const json = {
                    data: [{ type: 'field', path: 'field' }],
                    name: 'Test',
                    cellRenderer
                };

                const result = parseColumnDefinitionJson(json, testRuntime, undefined);
                expect(result.cellRenderer.section).toBe('cellRenderers');
                expect(result.cellRenderer.key).toBe(expected);
            });
        });

        it('should parse valid JSON with different cell renderer keys (new format)', () => {
            const testCases = [
                { cellRenderer: { section: 'cellRenderers', key: 'email' }, expected: 'email' },
                { cellRenderer: { section: 'cellRenderers', key: 'status' }, expected: 'status' },
                { cellRenderer: { section: 'cellRenderers', key: 'amount' }, expected: 'amount' }
            ];

            testCases.forEach(({ cellRenderer, expected }) => {
                const json = {
                    data: [{ type: 'field', path: 'field' }],
                    name: 'Test',
                    cellRenderer
                };

                const result = parseColumnDefinitionJson(json, testRuntime, undefined);
                expect(result.cellRenderer.section).toBe('cellRenderers');
                expect(result.cellRenderer.key).toBe(expected);
            });
        });

        it('should parse JSON with empty data array', () => {
            const json = {
                data: [],
                name: 'Empty',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.data).toEqual([]);
            expect(result.cellRenderer.section).toBe('cellRenderers');
            expect(result.cellRenderer.key).toBe('name');
        });

        it('should parse JSON with queryConfigs data', () => {
            const json = {
                data: [{
                    type: 'queryConfigs',
                    configs: [
                        { field: 'posts', limit: 5 },
                        { field: 'title' }
                    ]
                }],
                name: 'Posts',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.data).toEqual([{
                type: 'queryConfigs',
                configs: [
                    { field: 'posts', limit: 5 },
                    { field: 'title' }
                ]
            }]);
        });

        it('should parse JSON with queryConfigs including orderBy', () => {
            const json = {
                data: [{
                    type: 'queryConfigs',
                    configs: [
                        {
                            field: 'posts',
                            limit: 5,
                            orderBy: { key: 'createdAt', direction: 'DESC' }
                        },
                        { field: 'title' }
                    ]
                }],
                name: 'Recent Posts',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.data).toEqual([{
                type: 'queryConfigs',
                configs: [
                    {
                        field: 'posts',
                        limit: 5,
                        orderBy: { key: 'createdAt', direction: 'DESC' }
                    },
                    { field: 'title' }
                ]
            }]);
        });

        it('should handle null orderBy and limit in queryConfigs', () => {
            const json = {
                data: [{
                    type: 'queryConfigs',
                    configs: [
                        {
                            field: 'posts',
                            limit: null,
                            orderBy: null
                        },
                        { field: 'title' }
                    ]
                }],
                name: 'Posts with null values',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.data).toEqual([{
                type: 'queryConfigs',
                configs: [
                    { field: 'posts' }, // null values should be omitted
                    { field: 'title' }
                ]
            }]);
        });

        it('should handle mixed null and valid values in queryConfigs', () => {
            const json = {
                data: [{
                    type: 'queryConfigs',
                    configs: [
                        {
                            field: 'posts',
                            limit: 5,
                            orderBy: null // null orderBy should be ignored
                        },
                        {
                            field: 'comments',
                            limit: null, // null limit should be ignored
                            orderBy: { key: 'createdAt', direction: 'ASC' }
                        }
                    ]
                }],
                name: 'Mixed null values',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.data).toEqual([{
                type: 'queryConfigs',
                configs: [
                    { field: 'posts', limit: 5 },
                    { field: 'comments', orderBy: { key: 'createdAt', direction: 'ASC' } }
                ]
            }]);
        });
    });

    describe('input validation errors', () => {
        it('should throw error for null input', () => {
            expect(() => {
                parseColumnDefinitionJson(null, testRuntime, undefined);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for undefined input', () => {
            expect(() => {
                parseColumnDefinitionJson(undefined, testRuntime, undefined);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for string input', () => {
            expect(() => {
                parseColumnDefinitionJson('invalid', testRuntime, undefined);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for number input', () => {
            expect(() => {
                parseColumnDefinitionJson(123, testRuntime, undefined);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for array input', () => {
            expect(() => {
                parseColumnDefinitionJson([1, 2, 3], testRuntime, undefined);
            }).toThrow('Invalid JSON: Expected an object');
        });
    });

    describe('data field validation', () => {
        it('should throw error for missing data field', () => {
            const json = {
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });

        it('should throw error for null data field', () => {
            const json = {
                data: null,
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });

        it('should throw error for string data field', () => {
            const json = {
                data: 'not an array',
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });

        it('should throw error for object data field', () => {
            const json = {
                data: { field: 'value' },
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });
    });

    describe('name field validation', () => {
        it('should throw error for missing name field', () => {
            const json = {
                data: ['field'],
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for number name field', () => {
            const json = {
                data: ['field'],
                name: 123,
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for null name field', () => {
            const json = {
                data: ['field'],
                name: null,
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for object name field', () => {
            const json = {
                data: ['field'],
                name: { value: 'Name' },
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for array name field', () => {
            const json = {
                data: ['field'],
                name: ['Name'],
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });
    });

    describe('cellRenderer field validation', () => {
        it('should throw error for missing cellRenderer field', () => {
            const json = {
                data: ['field'],
                name: 'Name'
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid JSON: "cellRenderer" field is required');
        });

        it('should throw error for number cellRenderer field', () => {
            const json = {
                data: ['field'],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 123 }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid RuntimeReference: "key" must be a string');
        });

        it('should throw error for null cellRenderer field', () => {
            const json = {
                data: ['field'],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: null }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid RuntimeReference: "key" must be a string');
        });
    });

    describe('data array content validation', () => {
        it('should throw error for number in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, 123, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });

        it('should throw error for null in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, null, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });

        it('should throw error for object in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, { field: 'value' }, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: "type" must be "field" or "queryConfigs"');
        });

        it('should throw error for array in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, ['nested'], { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });

        it('should throw error for undefined in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, undefined, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });
    });

    describe('runtime key validation', () => {
        it('should throw error for invalid cellRenderer reference', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'invalidKey' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid cellRenderer reference: "invalidKey". Valid keys are: name, email, status, amount');
        });

        it('should throw error for empty string cellRenderer reference', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: '' }
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid cellRenderer reference: "". Valid keys are: name, email, status, amount');
        });

        it('should throw error for case-sensitive mismatch', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'NAME' } // Wrong case
            };

            expect(() => {
                parseColumnDefinitionJson(json, testRuntime, undefined);
            }).toThrow('Invalid cellRenderer reference: "NAME". Valid keys are: name, email, status, amount');
        });
    });

    describe('edge cases', () => {
        it('should handle empty string in data array', () => {
            const json = {
                data: [{ type: 'field', path: '' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.data).toEqual([{ type: 'field', path: '' }]);
        });

        it('should handle empty string as name', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: '',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result.name).toBe('');
        });

        it('should handle extra properties in JSON', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' },
                extraProperty: 'ignored'
            };

            const result = parseColumnDefinitionJson(json, testRuntime, undefined);
            expect(result).toEqual({
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRenderer: { section: 'cellRenderers', key: 'name' }
            });
            expect('extraProperty' in result).toBe(false);
        });
    });
});

describe('parseFilterFieldSchemaJson', () => {
    const testRuntime: Runtime = {
        cellRenderers: {},
        noRowsComponents: {},
        customFilterComponents: {},
        queryTransforms: {
            reference: {
                fromQuery: (input: any) => input.replace(/%$/, ''),
                toQuery: (input: any) => `${input}%`
            },
            amount: {
                fromQuery: (input: any) => input / 100,
                toQuery: (input: any) => input * 100
            },
            creditCard: {
                fromQuery: (input: any) => input.replace(/%/g, ''),
                toQuery: (input: any) => `%${input}%`
            }
        }
    };

    describe('successful parsing', () => {
        it('should parse valid FilterFieldSchema with basic filters', () => {
            const json = {
                groups: [
                    { name: 'default', label: null },
                    { name: 'advanced', label: 'Advanced Filters' }
                ],
                filters: [
                    {
                        label: 'Name',
                        expression: {
                            type: 'equals',
                            key: 'name',
                            value: { type: 'text' }
                        },
                        group: 'default',
                        aiGenerated: false
                    },
                    {
                        label: 'Status',
                        expression: {
                            type: 'in',
                            key: 'status',
                            value: {
                                type: 'multiselect',
                                items: [
                                    { label: 'Active', value: 'active' },
                                    { label: 'Inactive', value: 'inactive' }
                                ]
                            }
                        },
                        group: 'advanced',
                        aiGenerated: true
                    }
                ]
            };

            const result = parseFilterFieldSchemaJson(json, testRuntime, undefined);

            expect(result.groups).toHaveLength(2);
            expect(result.groups[0]).toEqual({ name: 'default', label: null });
            expect(result.groups[1]).toEqual({ name: 'advanced', label: 'Advanced Filters' });

            expect(result.filters).toHaveLength(2);
            expect(result.filters[0]).toEqual({
                label: 'Name',
                expression: {
                    type: 'equals',
                    key: 'name',
                    value: { type: 'text' }
                },
                group: 'default',
                aiGenerated: false
            });
            expect(result.filters[1].label).toBe('Status');
            expect(result.filters[1].expression.type).toBe('in');
            expect(result.filters[1].aiGenerated).toBe(true);
        });

        it('should parse filters with transform references', () => {
            const json = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Reference',
                        expression: {
                            type: 'equals',
                            key: 'reference',
                            value: { type: 'text' },
                            transform: { section: 'queryTransforms', key: 'reference' }
                        },
                        group: 'default',
                        aiGenerated: false
                    },
                    {
                        label: 'Amount',
                        expression: {
                            type: 'greaterThan',
                            key: 'amount',
                            value: { type: 'number' },
                            transform: { section: 'queryTransforms', key: 'amount' }
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            const result = parseFilterFieldSchemaJson(json, testRuntime, undefined);

            expect(result.filters).toHaveLength(2);

            // Check that transforms are resolved
            const referenceFilter = result.filters[0];
            expect(referenceFilter.label).toBe('Reference');
            expect('transform' in referenceFilter.expression).toBe(true);
            expect((referenceFilter.expression as any).transform).toBe(testRuntime.queryTransforms.reference);

            const amountFilter = result.filters[1];
            expect(amountFilter.label).toBe('Amount');
            expect('transform' in amountFilter.expression).toBe(true);
            expect((amountFilter.expression as any).transform).toBe(testRuntime.queryTransforms.amount);
        });

        it('should parse complex expressions with and/or/not', () => {
            const json = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Complex Filter',
                        expression: {
                            type: 'and',
                            filters: [
                                {
                                    type: 'equals',
                                    key: 'status',
                                    value: { type: 'text' }
                                },
                                {
                                    type: 'or',
                                    filters: [
                                        {
                                            type: 'greaterThan',
                                            key: 'amount',
                                            value: { type: 'number' },
                                            transform: { section: 'queryTransforms', key: 'amount' }
                                        },
                                        {
                                            type: 'not',
                                            filter: {
                                                type: 'equals',
                                                key: 'disabled',
                                                value: { type: 'text' }
                                            }
                                        }
                                    ]
                                }
                            ]
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            const result = parseFilterFieldSchemaJson(json, testRuntime, undefined);

            expect(result.filters).toHaveLength(1);
            const filter = result.filters[0];
            expect(filter.expression.type).toBe('and');

            const andExpr = filter.expression as any;
            expect(andExpr.filters).toHaveLength(2);
            expect(andExpr.filters[0].type).toBe('equals');
            expect(andExpr.filters[1].type).toBe('or');

            const orExpr = andExpr.filters[1];
            expect(orExpr.filters).toHaveLength(2);
            expect(orExpr.filters[0].type).toBe('greaterThan');
            expect('transform' in orExpr.filters[0]).toBe(true);
            expect(orExpr.filters[1].type).toBe('not');
        });

        it('should parse filters with customOperator controls', () => {
            const json = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Search',
                        expression: {
                            type: 'equals',
                            key: 'search',
                            value: {
                                type: 'customOperator',
                                operators: [
                                    { label: 'equals', value: '_eq' },
                                    { label: 'starts with', value: '_like' }
                                ],
                                valueControl: { type: 'text' }
                            },
                            transform: { section: 'queryTransforms', key: 'reference' }
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            const result = parseFilterFieldSchemaJson(json, testRuntime, undefined);

            expect(result.filters).toHaveLength(1);
            const filter = result.filters[0];
            expect(filter.expression.type).toBe('equals');
            expect((filter.expression as any).value.type).toBe('customOperator');
            expect('transform' in filter.expression).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should throw error for invalid JSON structure', () => {
            expect(() => parseFilterFieldSchemaJson(null, testRuntime, undefined))
                .toThrow('Invalid FilterFieldSchema: Expected an object');

            expect(() => parseFilterFieldSchemaJson([], testRuntime, undefined))
                .toThrow('Invalid FilterFieldSchema: Expected an object');

            expect(() => parseFilterFieldSchemaJson('string', testRuntime, undefined))
                .toThrow('Invalid FilterFieldSchema: Expected an object');
        });

        it('should throw error for missing or invalid groups', () => {
            expect(() => parseFilterFieldSchemaJson({ filters: [] }, testRuntime, undefined))
                .toThrow('Invalid FilterFieldSchema: "groups" must be an array');

            expect(() => parseFilterFieldSchemaJson({ groups: 'not-array', filters: [] }, testRuntime))
                .toThrow('Invalid FilterFieldSchema: "groups" must be an array');
        });

        it('should throw error for invalid group structure', () => {
            const invalidGroup = {
                groups: [{ label: 'Missing name' }],
                filters: []
            };

            expect(() => parseFilterFieldSchemaJson(invalidGroup, testRuntime, undefined))
                .toThrow('Invalid group[0]: "name" must be a string');

            const invalidGroupLabel = {
                groups: [{ name: 'test', label: 123 }],
                filters: []
            };

            expect(() => parseFilterFieldSchemaJson(invalidGroupLabel, testRuntime, undefined))
                .toThrow('Invalid group[0]: "label" must be a string or null');
        });

        it('should throw error for missing or invalid filters', () => {
            expect(() => parseFilterFieldSchemaJson({ groups: [] }, testRuntime, undefined))
                .toThrow('Invalid FilterFieldSchema: "filters" must be an array');

            expect(() => parseFilterFieldSchemaJson({ groups: [], filters: 'not-array' }, testRuntime))
                .toThrow('Invalid FilterFieldSchema: "filters" must be an array');
        });

        it('should throw error for invalid filter structure', () => {
            const invalidFilter = {
                groups: [{ name: 'default', label: null }],
                filters: [{ expression: { type: 'equals', key: 'test', value: { type: 'text' } } }]
            };

            expect(() => parseFilterFieldSchemaJson(invalidFilter, testRuntime, undefined))
                .toThrow('Invalid filter[0]: "label" must be a string');

            const missingGroup = {
                groups: [{ name: 'default', label: null }],
                filters: [{ label: 'Test', expression: { type: 'equals', key: 'test', value: { type: 'text' } } }]
            };

            expect(() => parseFilterFieldSchemaJson(missingGroup, testRuntime, undefined))
                .toThrow('Invalid filter[0]: "group" must be a string');

            const missingAiGenerated = {
                groups: [{ name: 'default', label: null }],
                filters: [{ label: 'Test', group: 'default', expression: { type: 'equals', key: 'test', value: { type: 'text' } } }]
            };

            expect(() => parseFilterFieldSchemaJson(missingAiGenerated, testRuntime, undefined))
                .toThrow('Invalid filter[0]: "aiGenerated" must be a boolean');
        });

        it('should throw error for missing expression', () => {
            const missingExpression = {
                groups: [{ name: 'default', label: null }],
                filters: [{ label: 'Test', group: 'default', aiGenerated: false }]
            };

            expect(() => parseFilterFieldSchemaJson(missingExpression, testRuntime, undefined))
                .toThrow('Invalid filter[0]: "expression" is required');
        });

        it('should throw error for invalid transform reference', () => {
            const invalidTransformReference = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Test',
                        expression: {
                            type: 'equals',
                            key: 'test',
                            value: { type: 'text' },
                            transform: { section: 'queryTransforms', key: 'nonExistentTransform' }
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            expect(() => parseFilterFieldSchemaJson(invalidTransformReference, testRuntime, undefined))
                .toThrow('Invalid filter[0] expression: Component "nonExistentTransform" not found in queryTransforms. Available keys: reference, amount, creditCard');
        });

        it('should throw error for invalid expression structure', () => {
            const invalidExpression = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Test',
                        expression: {
                            type: 'invalidType',
                            key: 'test',
                            value: { type: 'text' }
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            expect(() => parseFilterFieldSchemaJson(invalidExpression, testRuntime, undefined))
                .toThrow('Invalid FilterExpr type: "invalidType"');
        });

        it('should throw error for invalid composite expression', () => {
            const invalidAnd = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Test',
                        expression: {
                            type: 'and',
                            filters: 'not-array'
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            expect(() => parseFilterFieldSchemaJson(invalidAnd, testRuntime, undefined))
                .toThrow('Invalid and FilterExpr: "filters" must be an array');

            const invalidNot = {
                groups: [{ name: 'default', label: null }],
                filters: [
                    {
                        label: 'Test',
                        expression: {
                            type: 'not',
                            filter: 'not-object'
                        },
                        group: 'default',
                        aiGenerated: false
                    }
                ]
            };

            expect(() => parseFilterFieldSchemaJson(invalidNot, testRuntime, undefined))
                .toThrow('Invalid not FilterExpr: "filter" must be an object');
        });
    });
});

describe('parseViewJson', () => {
    const mockNoRowsComponent = () => null;

    const testRuntime = {
        cellRenderers: {
            text: () => 'text-renderer',
            number: () => 'number-renderer',
            custom: () => 'custom-renderer'
        },
        queryTransforms: {
            reference: {
                fromQuery: (input: any) => input.replace(/%$/, ''),
                toQuery: (input: any) => `${input}%`
            },
            amount: {
                fromQuery: (input: any) => input / 100,
                toQuery: (input: any) => input * 100
            },
            creditCardNumber: {
                fromQuery: (input: any) => input.replace(/%/g, ''),
                toQuery: (input: any) => `%${input}%`
            }
        },
        noRowsComponents: {
            noRowsExtendDateRange: mockNoRowsComponent
        },
        customFilterComponents: {}
    };

    const testRuntimes = {
        testRuntime: testRuntime
    };

    describe('successful parsing', () => {
        it('should parse valid ViewJson with all required fields', () => {
            const validJson = {
                title: 'Test View',
                routeName: 'test-view',
                collectionName: 'testCollection',
                paginationKey: 'createdAt',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: [
                    {
                        data: [{ type: 'field', path: 'id' }],
                        name: 'ID',
                        cellRenderer: { section: 'cellRenderers', key: 'text' }
                    }
                ],
                filterSchema: {
                    groups: [{ name: 'default', label: null }],
                    filters: [
                        {
                            label: 'Test Filter',
                            expression: {
                                type: 'equals',
                                key: 'test',
                                value: { type: 'text' }
                            },
                            group: 'default',
                            aiGenerated: false
                        }
                    ]
                }
            };

            const result = parseViewJson(validJson, testRuntimes);

            expect(result.title).toBe('Test View');
            expect(result.routeName).toBe('test-view');
            expect(result.collectionName).toBe('testCollection');
            expect(result.paginationKey).toBe('createdAt');
            expect(result.boolExpType).toBe('TestBoolExp');
            expect(result.orderByType).toBe('[TestOrderBy!]');
            expect(result.columnDefinitions).toHaveLength(1);
            expect(result.filterSchema.groups).toHaveLength(1);
            expect(result.filterSchema.filters).toHaveLength(1);
            expect(result.noRowsComponent).toBeUndefined();
        });

        it('should parse ViewJson with noRowsComponent', () => {
            const validJson = {
                title: 'Test View',
                routeName: 'test-view',
                collectionName: 'testCollection',
                paginationKey: 'createdAt',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                noRowsComponent: { section: 'noRowsComponents', key: 'noRowsExtendDateRange' },
                columns: [
                    {
                        data: [{ type: 'field', path: 'id' }],
                        name: 'ID',
                        cellRenderer: { section: 'cellRenderers', key: 'text' }
                    }
                ],
                filterSchema: {
                    groups: [{ name: 'default', label: null }],
                    filters: []
                }
            };

            const result = parseViewJson(validJson, testRuntimes);

            expect(result.noRowsComponent).toBe(mockNoRowsComponent);
        });

        it('should parse ViewJson with multiple columns and complex filters', () => {
            const complexJson = {
                title: 'Complex View',
                routeName: 'complex-view',
                collectionName: 'complexCollection',
                paginationKey: 'updatedAt',
                boolExpType: 'ComplexBoolExp',
                orderByType: '[ComplexOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: [
                    {
                        data: [{ type: 'field', path: 'id' }],
                        name: 'ID',
                        cellRenderer: { section: 'cellRenderers', key: 'text' }
                    },
                    {
                        data: [
                            { type: 'field', path: 'amount' },
                            {
                                type: 'queryConfigs',
                                configs: [
                                    { field: 'currency', limit: 1 }
                                ]
                            }
                        ],
                        name: 'Amount',
                        cellRenderer: { section: 'cellRenderers', key: 'number' }
                    }
                ],
                filterSchema: {
                    groups: [
                        { name: 'default', label: null },
                        { name: 'advanced', label: 'Advanced Filters' }
                    ],
                    filters: [
                        {
                            label: 'Reference',
                            expression: {
                                type: 'equals',
                                key: 'reference',
                                value: { type: 'text' },
                                transform: { section: 'queryTransforms', key: 'reference' }
                            },
                            group: 'default',
                            aiGenerated: false
                        },
                        {
                            label: 'Complex Filter',
                            expression: {
                                type: 'and',
                                filters: [
                                    {
                                        type: 'greaterThan',
                                        key: 'amount',
                                        value: { type: 'number' }
                                    },
                                    {
                                        type: 'in',
                                        key: 'status',
                                        value: {
                                            type: 'multiselect',
                                            config: {
                                                items: [
                                                    { label: 'Active', value: 'active' },
                                                    { label: 'Inactive', value: 'inactive' }
                                                ]
                                            }
                                        }
                                    }
                                ]
                            },
                            group: 'advanced',
                            aiGenerated: true
                        }
                    ]
                }
            };

            const result = parseViewJson(complexJson, testRuntimes);

            expect(result.columnDefinitions).toHaveLength(2);
            expect(result.filterSchema.groups).toHaveLength(2);
            expect(result.filterSchema.filters).toHaveLength(2);
            expect(result.filterSchema.filters[0].expression.type).toBe('equals');
            expect(result.filterSchema.filters[1].expression.type).toBe('and');
            expect(result.filterSchema.filters[1].aiGenerated).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should throw error for invalid JSON structure', () => {
            expect(() => parseViewJson(null, testRuntimes))
                .toThrow('View JSON must be a non-null object');

            expect(() => parseViewJson([], testRuntimes))
                .toThrow('View JSON must be a non-null object');

            expect(() => parseViewJson('string', testRuntimes))
                .toThrow('View JSON must be a non-null object');

            expect(() => parseViewJson(123, testRuntimes))
                .toThrow('View JSON must be a non-null object');
        });

        it('should throw error for missing or invalid title', () => {
            const noTitle = {
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                columns: [],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noTitle, testRuntimes))
                .toThrow('View "title" must be a string');

            const invalidTitle = { ...noTitle, title: 123 };
            expect(() => parseViewJson(invalidTitle, testRuntimes))
                .toThrow('View "title" must be a string');
        });

        it('should throw error for missing or invalid routeName', () => {
            const noRouteName = {
                title: 'Test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                columns: [],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noRouteName, testRuntimes))
                .toThrow('View "routeName" must be a string');

            const invalidRouteName = { ...noRouteName, routeName: null };
            expect(() => parseViewJson(invalidRouteName, testRuntimes))
                .toThrow('View "routeName" must be a string');
        });

        it('should throw error for missing or invalid collectionName', () => {
            const noCollectionName = {
                title: 'Test',
                routeName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                columns: [],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noCollectionName, testRuntimes))
                .toThrow('View "collectionName" must be a string');

            const invalidCollectionName = { ...noCollectionName, collectionName: {} };
            expect(() => parseViewJson(invalidCollectionName, testRuntimes))
                .toThrow('View "collectionName" must be a string');
        });

        it('should throw error for missing or invalid paginationKey', () => {
            const noPaginationKey = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                columns: [],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noPaginationKey, testRuntimes))
                .toThrow('View "paginationKey" must be a string');

            const invalidPaginationKey = { ...noPaginationKey, paginationKey: [] };
            expect(() => parseViewJson(invalidPaginationKey, testRuntimes))
                .toThrow('View "paginationKey" must be a string');
        });

        it('should throw error for missing or invalid GraphQL types', () => {
            const noBoolExpType = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                orderByType: '[TestOrderBy!]',
                columns: [],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noBoolExpType, testRuntimes))
                .toThrow('View "boolExpType" must be a string');

            const noOrderByType = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                columns: [],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noOrderByType, testRuntimes))
                .toThrow('View "orderByType" must be a string');
        });

        it('should throw error for missing or invalid columns', () => {
            const noColumns = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(noColumns, testRuntimes))
                .toThrow('View "columns" must be an array');

            const invalidColumns = { ...noColumns, columns: 'not-array' };
            expect(() => parseViewJson(invalidColumns, testRuntimes))
                .toThrow('View "columns" must be an array');
        });

        it('should throw error for missing filterSchema', () => {
            const noFilterSchema = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: []
            };

            expect(() => parseViewJson(noFilterSchema, testRuntimes))
                .toThrow('View "filterSchema" is required');
        });

        it('should throw error for invalid column in columns array', () => {
            const invalidColumn = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: [
                    {
                        data: [],
                        name: 'Test',
                        cellRenderer: { section: 'cellRenderers', key: 'nonexistent' }
                    }
                ],
                filterSchema: { groups: [], filters: [] }
            };

            expect(() => parseViewJson(invalidColumn, testRuntimes))
                .toThrow('Invalid column[0]:');
        });

        it('should throw error for invalid filterSchema', () => {
            const invalidFilterSchema = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: [],
                filterSchema: {
                    groups: 'not-array',
                    filters: []
                }
            };

            expect(() => parseViewJson(invalidFilterSchema, testRuntimes))
                .toThrow('Invalid filterSchema:');
        });

        it('should throw error for missing noRowsComponent in runtime', () => {
            const missingNoRowsComponent = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: [],
                filterSchema: { groups: [], filters: [] },
                noRowsComponent: { section: 'noRowsComponents', key: 'nonexistent' }
            };

            expect(() => parseViewJson(missingNoRowsComponent, testRuntimes))
                .toThrow('Component "nonexistent" not found in noRowsComponents. Available keys: noRowsExtendDateRange');
        });

        it('should throw error when runtime has no noRowsComponents', () => {
            const runtimeWithoutNoRows = {
                ...testRuntime,
                noRowsComponents: {},
                customFilterComponents: {}
            };

            const runtimesDictWithoutNoRows = {
                testRuntime: runtimeWithoutNoRows
            };

            const withNoRowsComponent = {
                title: 'Test',
                routeName: 'test',
                collectionName: 'test',
                paginationKey: 'id',
                boolExpType: 'TestBoolExp',
                orderByType: '[TestOrderBy!]',
                runtimeKey: 'testRuntime',
                columns: [],
                filterSchema: { groups: [], filters: [] },
                noRowsComponent: { section: 'noRowsComponents', key: 'anything' }
            };

            expect(() => parseViewJson(withNoRowsComponent, runtimesDictWithoutNoRows))
                .toThrow('Component "anything" not found in noRowsComponents. Available keys:');
        });
    });
});

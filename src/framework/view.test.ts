import { parseColumnDefinitionJson } from './view-parser';

// Test runtime type
type TestRuntime = {
    cellRenderers: {
        name: () => string;
        email: () => string;
        status: () => string;
        amount: () => string;
    };
};

describe('parseColumnDefinitionJson', () => {
    const testRuntime: TestRuntime = {
        cellRenderers: {
            name: () => 'test',
            email: () => 'test',
            status: () => 'test',
            amount: () => 'test'
        }
    };

    describe('successful parsing', () => {
        it('should parse valid JSON with single data field', () => {
            const json = {
                data: [{ type: 'field', path: 'user.name' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);

            expect(result).toEqual({
                data: [{ type: 'field', path: 'user.name' }],
                name: 'Name',
                cellRendererKey: 'name'
            });
        });

        it('should parse valid JSON with multiple data fields', () => {
            const json = {
                data: [
                    { type: 'field', path: 'user.firstName' },
                    { type: 'field', path: 'user.lastName' }
                ],
                name: 'Full Name',
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);

            expect(result).toEqual({
                data: [
                    { type: 'field', path: 'user.firstName' },
                    { type: 'field', path: 'user.lastName' }
                ],
                name: 'Full Name',
                cellRendererKey: 'name'
            });
        });

        it('should parse valid JSON with different cell renderer keys', () => {
            const testCases = [
                { cellRendererKey: 'email', expected: 'email' },
                { cellRendererKey: 'status', expected: 'status' },
                { cellRendererKey: 'amount', expected: 'amount' }
            ];

            testCases.forEach(({ cellRendererKey, expected }) => {
                const json = {
                    data: [{ type: 'field', path: 'field' }],
                    name: 'Test',
                    cellRendererKey
                };

                const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
                expect(result.cellRendererKey).toBe(expected);
            });
        });

        it('should parse JSON with empty data array', () => {
            const json = {
                data: [],
                name: 'Empty',
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            expect(result.data).toEqual([]);
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
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
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
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
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
    });

    describe('input validation errors', () => {
        it('should throw error for null input', () => {
            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(null, testRuntime);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for undefined input', () => {
            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(undefined, testRuntime);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for string input', () => {
            expect(() => {
                parseColumnDefinitionJson<TestRuntime>('invalid', testRuntime);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for number input', () => {
            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(123, testRuntime);
            }).toThrow('Invalid JSON: Expected an object');
        });

        it('should throw error for array input', () => {
            expect(() => {
                parseColumnDefinitionJson<TestRuntime>([1, 2, 3], testRuntime);
            }).toThrow('Invalid JSON: Expected an object');
        });
    });

    describe('data field validation', () => {
        it('should throw error for missing data field', () => {
            const json = {
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });

        it('should throw error for null data field', () => {
            const json = {
                data: null,
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });

        it('should throw error for string data field', () => {
            const json = {
                data: 'not an array',
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });

        it('should throw error for object data field', () => {
            const json = {
                data: { field: 'value' },
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "data" field must be an array of FieldQuery objects');
        });
    });

    describe('name field validation', () => {
        it('should throw error for missing name field', () => {
            const json = {
                data: ['field'],
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for number name field', () => {
            const json = {
                data: ['field'],
                name: 123,
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for null name field', () => {
            const json = {
                data: ['field'],
                name: null,
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for object name field', () => {
            const json = {
                data: ['field'],
                name: { value: 'Name' },
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });

        it('should throw error for array name field', () => {
            const json = {
                data: ['field'],
                name: ['Name'],
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "name" field must be a string');
        });
    });

    describe('cellRendererKey field validation', () => {
        it('should throw error for missing cellRendererKey field', () => {
            const json = {
                data: ['field'],
                name: 'Name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "cellRendererKey" field must be a string');
        });

        it('should throw error for number cellRendererKey field', () => {
            const json = {
                data: ['field'],
                name: 'Name',
                cellRendererKey: 123
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "cellRendererKey" field must be a string');
        });

        it('should throw error for null cellRendererKey field', () => {
            const json = {
                data: ['field'],
                name: 'Name',
                cellRendererKey: null
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "cellRendererKey" field must be a string');
        });

        it('should throw error for object cellRendererKey field', () => {
            const json = {
                data: ['field'],
                name: 'Name',
                cellRendererKey: { key: 'name' }
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid JSON: "cellRendererKey" field must be a string');
        });
    });

    describe('data array content validation', () => {
        it('should throw error for number in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, 123, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });

        it('should throw error for null in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, null, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });

        it('should throw error for object in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, { field: 'value' }, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: "type" must be "field" or "queryConfigs"');
        });

        it('should throw error for array in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, ['nested'], { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });

        it('should throw error for undefined in data array', () => {
            const json = {
                data: [{ type: 'field', path: 'valid' }, undefined, { type: 'field', path: 'valid2' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid data[1]: Invalid FieldQuery: Expected an object');
        });
    });

    describe('runtime key validation', () => {
        it('should throw error for invalid cellRendererKey', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRendererKey: 'invalidKey'
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid cellRendererKey: "invalidKey". Valid keys are: name, email, status, amount');
        });

        it('should throw error for empty string cellRendererKey', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRendererKey: ''
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid cellRendererKey: "". Valid keys are: name, email, status, amount');
        });

        it('should throw error for case-sensitive mismatch', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRendererKey: 'NAME' // Wrong case
            };

            expect(() => {
                parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            }).toThrow('Invalid cellRendererKey: "NAME". Valid keys are: name, email, status, amount');
        });
    });

    describe('edge cases', () => {
        it('should handle empty string in data array', () => {
            const json = {
                data: [{ type: 'field', path: '' }],
                name: 'Name',
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            expect(result.data).toEqual([{ type: 'field', path: '' }]);
        });

        it('should handle empty string as name', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: '',
                cellRendererKey: 'name'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            expect(result.name).toBe('');
        });

        it('should handle extra properties in JSON', () => {
            const json = {
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRendererKey: 'name',
                extraProperty: 'ignored'
            };

            const result = parseColumnDefinitionJson<TestRuntime>(json, testRuntime);
            expect(result).toEqual({
                data: [{ type: 'field', path: 'field' }],
                name: 'Name',
                cellRendererKey: 'name'
            });
            expect('extraProperty' in result).toBe(false);
        });
    });
});

import { FilterState } from './state';
import { buildHasuraConditions } from './graphql';
import { FilterSchemasAndGroups } from './filters';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';

describe('buildHasuraConditions', () => {
    // Helper function to create a simple filter schema for testing
    const createFilterSchema = (filterId: string, expression: any): FilterSchemasAndGroups => ({
        groups: [{ name: 'basic', label: 'Basic Filters' }],
        filters: [
            {
                id: filterId,
                label: 'Test Filter',
                expression,
                group: 'basic',
                aiGenerated: false
            }
        ]
    });

    it('should return an empty object for no conditions', () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [],
            filters: []
        };
        expect(buildHasuraConditions(new Map(), filterSchema)).toEqual({});
    });

    it('should handle a single condition', () => {
        const filterSchema = createFilterSchema(
            'name-filter',
            FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        );

        const formState: FilterState = new Map([
            ['name-filter', { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({ name: { _eq: 'test' } });
    });

    it('should handle multiple conditions with an implicit AND', () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'name-filter',
                    label: 'Name Filter',
                    expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                },
                {
                    id: 'age-filter',
                    label: 'Age Filter',
                    expression: FilterExpr.greaterThan({ field: 'age', control: FilterControl.number() }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        const formState: FilterState = new Map([
            ['name-filter', { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }],
            ['age-filter', { type: 'leaf', field: 'age', filterType: 'greaterThan', value: 20, control: { type: 'number' } }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            _and: [
                { name: { _eq: 'test' } },
                { age: { _gt: 20 } }
            ]
        });
    });

    it('should handle nested fields', () => {
        const filterSchema = createFilterSchema(
            'user-name-filter',
            FilterExpr.equals({ field: 'user.name', control: FilterControl.text() })
        );

        const formState: FilterState = new Map([
            ['user-name-filter', { type: 'leaf', field: 'user.name', filterType: 'equals', value: 'test', control: { type: 'text' } }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            user: { name: { _eq: 'test' } }
        });
    });

    it('should handle deeply nested fields', () => {
        const filterSchema = createFilterSchema(
            'deep-filter',
            FilterExpr.equals({ field: 'a.b.c.d', control: FilterControl.text() })
        );

        const formState: FilterState = new Map([
            ['deep-filter', { type: 'leaf', field: 'a.b.c.d', filterType: 'equals', value: 'deep', control: { type: 'text' } }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            a: { b: { c: { d: { _eq: 'deep' } } } }
        });
    });

    it('should handle explicit AND/OR conditions', () => {
        const filterSchema = createFilterSchema(
            'or-filter',
            FilterExpr.or({
                filters: [
                    FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
                    FilterExpr.equals({ field: 'name', control: FilterControl.text() })
                ]
            })
        );

        const formState: FilterState = new Map([
            ['or-filter', {
                type: 'or',
                filterType: 'or',
                children: [
                    { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } },
                    { type: 'leaf', field: 'name', filterType: 'equals', value: 'another', control: { type: 'text' } }
                ]
            }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            _or: [
                { name: { _eq: 'test' } },
                { name: { _eq: 'another' } }
            ]
        });
    });

    it('should handle NOT conditions', () => {
        const filterSchema = createFilterSchema(
            'not-filter',
            FilterExpr.not({
                filter: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
            })
        );

        const formState: FilterState = new Map([
            ['not-filter', {
                type: 'not',
                filterType: 'not',
                child: { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }
            }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            _not: { name: { _eq: 'test' } }
        });
    });

    it('should handle complex nested structures', () => {
        const filterSchema = createFilterSchema(
            'complex-filter',
            FilterExpr.and({
                filters: [
                    FilterExpr.greaterThan({ field: 'age', control: FilterControl.number() }),
                    FilterExpr.or({
                        filters: [
                            FilterExpr.iLike({ field: 'user.name', control: FilterControl.text() }),
                            FilterExpr.not({
                                filter: FilterExpr.equals({ field: 'user.role', control: FilterControl.text() })
                            })
                        ]
                    })
                ]
            })
        );

        const formState: FilterState = new Map([
            ['complex-filter', {
                type: 'and',
                filterType: 'and',
                children: [
                    { type: 'leaf', field: 'age', filterType: 'greaterThan', value: 20, control: { type: 'number' } },
                    {
                        type: 'or',
                        filterType: 'or',
                        children: [
                            { type: 'leaf', field: 'user.name', filterType: 'iLike', value: '%test%', control: { type: 'text' } },
                            {
                                type: 'not',
                                filterType: 'not',
                                child: { type: 'leaf', field: 'user.role', filterType: 'equals', value: 'admin', control: { type: 'text' } }
                            }
                        ]
                    }
                ]
            }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            _and: [
                { age: { _gt: 20 } },
                {
                    _or: [
                        { user: { name: { _ilike: '%test%' } } },
                        { _not: { user: { role: { _eq: 'admin' } } } }
                    ]
                }
            ]
        });
    });

    it('should ignore empty or invalid values', () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'name-filter',
                    label: 'Name Filter',
                    expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                },
                {
                    id: 'age-filter',
                    label: 'Age Filter',
                    expression: FilterExpr.greaterThan({ field: 'age', control: FilterControl.number() }),
                    group: 'basic',
                    aiGenerated: false
                },
                {
                    id: 'tags-filter',
                    label: 'Tags Filter',
                    expression: FilterExpr.in({ field: 'tags', control: FilterControl.multiselect({ items: [] }) }),
                    group: 'basic',
                    aiGenerated: false
                },
                {
                    id: 'valid-filter',
                    label: 'Valid Filter',
                    expression: FilterExpr.equals({ field: 'valid', control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        const formState: FilterState = new Map([
            ['name-filter', { type: 'leaf', field: 'name', filterType: 'equals', value: '', control: { type: 'text' } }],
            ['age-filter', { type: 'leaf', field: 'age', filterType: 'greaterThan', value: undefined, control: { type: 'number' } }],
            ['tags-filter', { type: 'leaf', field: 'tags', filterType: 'in', value: [], control: { type: 'multiselect', items: [] } }],
            ['valid-filter', { type: 'leaf', field: 'valid', filterType: 'equals', value: 'good', control: { type: 'text' } }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({ valid: { _eq: 'good' } });
    });

    it('should handle custom operators', () => {
        const filterSchema = createFilterSchema(
            'custom-filter',
            FilterExpr.equals({
                field: 'custom_field',
                control: FilterControl.customOperator({
                    operators: [{ label: 'Custom Op', value: '_custom_op' }],
                    valueControl: FilterControl.text()
                })
            })
        );

        const formState: FilterState = new Map([
            ['custom-filter', {
                type: 'leaf',
                field: 'custom_field',
                filterType: 'equals', // This is not used for custom operators, but required by the type
                value: { operator: '_custom_op', value: 'some_value' },
                control: { type: 'customOperator', operators: [{ label: 'Custom Op', value: '_custom_op' }], valueControl: { type: 'text' } }
            }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            custom_field: { _custom_op: 'some_value' }
        });
    });

    it('should handle custom operators with nested fields', () => {
        const filterSchema = createFilterSchema(
            'user-name-custom-filter',
            FilterExpr.equals({
                field: 'user.name',
                control: FilterControl.customOperator({
                    operators: [{ label: 'iLike', value: '_ilike' }],
                    valueControl: FilterControl.text()
                })
            })
        );

        const formState: FilterState = new Map([
            ['user-name-custom-filter', {
                type: 'leaf',
                field: 'user.name',
                filterType: 'equals', // This is not used for custom operators, but required by the type
                value: { operator: '_ilike', value: '%test%' },
                control: { type: 'customOperator', operators: [{ label: 'iLike', value: '_ilike' }], valueControl: { type: 'text' } }
            }]
        ]);
        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            user: { name: { _ilike: '%test%' } }
        });
    });

    it('should accept a prebuilt HasuraCondition via transform.toQuery', () => {
        const prebuilt = { user: { is_active: { _eq: true } } };
        const filterSchema = createFilterSchema(
            'prebuilt-condition',
            FilterExpr.equals({
                field: 'ignored',
                control: FilterControl.text(),
                transform: {
                    toQuery: () => ({ condition: prebuilt })
                }
            })
        );

        const formState: FilterState = new Map([
            ['prebuilt-condition', { type: 'leaf', field: 'ignored', filterType: 'equals', value: 'ignored', control: { type: 'text' } }]
        ]);

        expect(buildHasuraConditions(formState, filterSchema)).toEqual(prebuilt);
    });

});

describe("Multi-field Filter Support with buildHasuraConditions", () => {
    it("should handle object format with and", () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'multi-and-filter',
                    label: 'Multi AND Filter',
                    expression: FilterExpr.equals({ field: { and: ['name', 'title'] }, control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        const formState: FilterState = new Map([
            ['multi-and-filter', {
                type: 'leaf',
                field: { and: ['name', 'title'] },
                filterType: 'equals',
                value: 'test',
                control: { type: 'text' }
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(result).toEqual({
            _and: [
                { name: { _eq: 'test' } },
                { title: { _eq: 'test' } }
            ]
        });
    });

    it("should handle object format with or", () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'multi-or-filter',
                    label: 'Multi OR Filter',
                    expression: FilterExpr.equals({ field: { or: ['name', 'title'] }, control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        const formState: FilterState = new Map([
            ['multi-or-filter', {
                type: 'leaf',
                field: { or: ['name', 'title'] },
                filterType: 'equals',
                value: 'test',
                control: { type: 'text' }
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(result).toEqual({
            _or: [
                { name: { _eq: 'test' } },
                { title: { _eq: 'test' } }
            ]
        });
    });

    it("should handle nested fields with object format", () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'nested-multi-filter',
                    label: 'Nested Multi Filter',
                    expression: FilterExpr.iLike({ field: { or: ['user.email', 'user.username'] }, control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        const formState: FilterState = new Map([
            ['nested-multi-filter', {
                type: 'leaf',
                field: { or: ['user.email', 'user.username'] },
                filterType: 'iLike',
                value: '%john%',
                control: { type: 'text' }
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(result).toEqual({
            _or: [
                { user: { email: { _ilike: '%john%' } } },
                { user: { username: { _ilike: '%john%' } } }
            ]
        });
    });

    it("should handle mixed multi-field and single field expressions", () => {
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'search-filter',
                    label: 'Search Filter',
                    expression: FilterExpr.iLike({ field: { or: ['name', 'title'] }, control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                },
                {
                    id: 'category-filter',
                    label: 'Category Filter',
                    expression: FilterExpr.equals({ field: 'category', control: FilterControl.text() }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        const formState: FilterState = new Map([
            ['search-filter', {
                type: 'leaf',
                field: { or: ['name', 'title'] },
                filterType: 'iLike',
                value: '%search%',
                control: { type: 'text' }
            }],
            ['category-filter', {
                type: 'leaf',
                field: 'category',
                filterType: 'equals',
                value: 'tech',
                control: { type: 'text' }
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(result).toEqual({
            _and: [
                {
                    _or: [
                        { name: { _ilike: '%search%' } },
                        { title: { _ilike: '%search%' } }
                    ]
                },
                { category: { _eq: 'tech' } }
            ]
        });
    });

    it('should handle transforms in filter schema', () => {
        // Create a filter schema with transform
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'basic', label: 'Basic Filters' }],
            filters: [
                {
                    id: 'email-filter',
                    label: 'Email Filter',
                    expression: FilterExpr.equals({
                        field: 'user.email',
                        control: FilterControl.text(),
                        transform: {
                            toQuery: (input: unknown) => ({
                                field: 'user.email_address', // transform field name
                                value: String(input).toLowerCase() // transform value
                            })
                        }
                    }),
                    group: 'basic',
                    aiGenerated: false
                }
            ]
        };

        // Create filter state with original value
        const formState = new Map();
        formState.set('email-filter', {
            type: 'leaf' as const,
            field: 'user.email', // This should be ignored in favor of schema
            value: 'TEST@EXAMPLE.COM',
            control: { type: 'text' as const }, // This should be ignored in favor of schema
            filterType: 'equals' // This should be ignored in favor of schema
        });

        expect(buildHasuraConditions(formState, filterSchema)).toEqual({
            user: { email_address: { _eq: 'test@example.com' } }
        });
    });
});

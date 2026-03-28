import { FilterState } from './state';
import { buildHasuraConditions, hasuraFilterExpressionToObject, Hasura } from './graphql';
import type { FilterGroups } from './filters';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import * as FilterValue from './filterValue';

describe('buildHasuraConditions', () => {
    // Helper function to create a simple filter schema for testing
    const createFilterSchema = (filterId: string, expression: any): FilterGroups => ([
        {
            name: 'basic',
            label: 'Basic Filters',
            filters: [
                {
                    id: filterId,
                    label: 'Test Filter',
                    expression,
                    aiGenerated: false
                }
            ]
        }
    ]);

    it('should return an empty object for no conditions', () => {
        const filterSchema: FilterGroups = [];
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(new Map(), filterSchema))).toEqual({});
    });

    it('should handle a single condition', () => {
        const filterSchema = createFilterSchema(
            'name-filter',
            FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        );

        const formState: FilterState = new Map([
            ['name-filter', { type: 'leaf', value: FilterValue.value('test') }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({ name: { _eq: 'test' } });
    });

    it('should handle multiple conditions with an implicit AND', () => {
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
                filters: [
                    {
                        id: 'name-filter',
                        label: 'Name Filter',
                        expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
                        aiGenerated: false
                    },
                    {
                        id: 'age-filter',
                        label: 'Age Filter',
                        expression: FilterExpr.greaterThan({ field: 'age', control: FilterControl.number() }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        const formState: FilterState = new Map([
            ['name-filter', { type: 'leaf', value: FilterValue.value('test') }],
            ['age-filter', { type: 'leaf', value: FilterValue.value(20) }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
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
            ['user-name-filter', { type: 'leaf', value: FilterValue.value('test') }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
            user: { name: { _eq: 'test' } }
        });
    });

    it('should handle deeply nested fields', () => {
        const filterSchema = createFilterSchema(
            'deep-filter',
            FilterExpr.equals({ field: 'a.b.c.d', control: FilterControl.text() })
        );

        const formState: FilterState = new Map([
            ['deep-filter', { type: 'leaf', value: FilterValue.value('deep') }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
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
                    { type: 'leaf', value: FilterValue.value('test') },
                    { type: 'leaf', value: FilterValue.value('another') }
                ]
            }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
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
                child: { type: 'leaf', value: FilterValue.value('test') }
            }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
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
                    { type: 'leaf', value: FilterValue.value(20) },
                    {
                        type: 'or',
                        filterType: 'or',
                        children: [
                            { type: 'leaf', value: FilterValue.value('%test%') },
                            {
                                type: 'not',
                                filterType: 'not',
                                child: { type: 'leaf', value: FilterValue.value('admin') }
                            }
                        ]
                    }
                ]
            }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
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
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
                filters: [
                    {
                        id: 'name-filter',
                        label: 'Name Filter',
                        expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
                        aiGenerated: false
                    },
                    {
                        id: 'age-filter',
                        label: 'Age Filter',
                        expression: FilterExpr.greaterThan({ field: 'age', control: FilterControl.number() }),
                        aiGenerated: false
                    },
                    {
                        id: 'tags-filter',
                        label: 'Tags Filter',
                        expression: FilterExpr.in({ field: 'tags', control: FilterControl.multiselect({ items: [] }) }),
                        aiGenerated: false
                    },
                    {
                        id: 'valid-filter',
                        label: 'Valid Filter',
                        expression: FilterExpr.equals({ field: 'valid', control: FilterControl.text() }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        const formState: FilterState = new Map([
            ['name-filter', { type: 'leaf', value: FilterValue.empty }],
            ['age-filter', { type: 'leaf', value: FilterValue.empty }],
            ['tags-filter', { type: 'leaf', value: FilterValue.empty }],
            ['valid-filter', { type: 'leaf', value: FilterValue.value('good') }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({ valid: { _eq: 'good' } });
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
                value: FilterValue.value({ operator: '_custom_op', value: FilterValue.value('some_value') })
            }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
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
                value: FilterValue.value({ operator: '_ilike', value: FilterValue.value('%test%') })
            }]
        ]);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
            user: { name: { _ilike: '%test%' } }
        });
    });

    it('should accept a prebuilt condition expr via transform.toQuery', () => {
        const prebuilt = Hasura.scope('user', Hasura.condition('is_active', Hasura.eq(true)));
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
            ['prebuilt-condition', { type: 'leaf', value: FilterValue.value('ignored') }]
        ]);

        expect(buildHasuraConditions(formState, filterSchema)).toEqual(prebuilt);
        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
            user: { is_active: { _eq: true } }
        });
    });

});

describe("Multi-field Filter Support with buildHasuraConditions", () => {
    it("should handle object format with and", () => {
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
                filters: [
                    {
                        id: 'multi-and-filter',
                        label: 'Multi AND Filter',
                        expression: FilterExpr.equals({ field: { and: ['name', 'title'] }, control: FilterControl.text() }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        const formState: FilterState = new Map([
            ['multi-and-filter', {
                type: 'leaf',
                value: FilterValue.value('test')
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(hasuraFilterExpressionToObject(result)).toEqual({
            _and: [
                { name: { _eq: 'test' } },
                { title: { _eq: 'test' } }
            ]
        });
    });

    it("should handle object format with or", () => {
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
                filters: [
                    {
                        id: 'multi-or-filter',
                        label: 'Multi OR Filter',
                        expression: FilterExpr.equals({ field: { or: ['name', 'title'] }, control: FilterControl.text() }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        const formState: FilterState = new Map([
            ['multi-or-filter', {
                type: 'leaf',
                value: FilterValue.value('test')
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(hasuraFilterExpressionToObject(result)).toEqual({
            _or: [
                { name: { _eq: 'test' } },
                { title: { _eq: 'test' } }
            ]
        });
    });

    it("should handle nested fields with object format", () => {
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
                filters: [
                    {
                        id: 'nested-multi-filter',
                        label: 'Nested Multi Filter',
                        expression: FilterExpr.iLike({ field: { or: ['user.email', 'user.username'] }, control: FilterControl.text() }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        const formState: FilterState = new Map([
            ['nested-multi-filter', {
                type: 'leaf',
                value: FilterValue.value('%john%')
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(hasuraFilterExpressionToObject(result)).toEqual({
            _or: [
                { user: { email: { _ilike: '%john%' } } },
                { user: { username: { _ilike: '%john%' } } }
            ]
        });
    });

    it("should handle mixed multi-field and single field expressions", () => {
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
                filters: [
                    {
                        id: 'search-filter',
                        label: 'Search Filter',
                        expression: FilterExpr.iLike({ field: { or: ['name', 'title'] }, control: FilterControl.text() }),
                        aiGenerated: false
                    },
                    {
                        id: 'category-filter',
                        label: 'Category Filter',
                        expression: FilterExpr.equals({ field: 'category', control: FilterControl.text() }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        const formState: FilterState = new Map([
            ['search-filter', {
                type: 'leaf',
                value: FilterValue.value('%search%')
            }],
            ['category-filter', {
                type: 'leaf',
                value: FilterValue.value('tech')
            }]
        ]);

        const result = buildHasuraConditions(formState, filterSchema);

        expect(hasuraFilterExpressionToObject(result)).toEqual({
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
        const filterSchema: FilterGroups = [
            {
                name: 'basic',
                label: 'Basic Filters',
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
                                    value: FilterValue.value(String(input).toLowerCase()) // transform value
                                })
                            }
                        }),
                        aiGenerated: false
                    }
                ]
            }
        ];

        // Create filter state with original value
        const formState = new Map();
        formState.set('email-filter', {
            type: 'leaf' as const,
            value: FilterValue.value('TEST@EXAMPLE.COM')
        });

        expect(hasuraFilterExpressionToObject(buildHasuraConditions(formState, filterSchema))).toEqual({
            user: { email_address: { _eq: 'test@example.com' } }
        });
    });
});

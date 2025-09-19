import { buildHasuraConditions } from './graphql';
import { FilterState } from './state';

describe('Multi-field Filter Support - buildHasuraConditions', () => {
    describe('and() expressions using object format', () => {
        it('should handle and object with multiple fields', () => {
            const formState: FilterState = new Map([
                ['multi-and-filter', {
                    type: 'leaf',
                    field: { and: ['name', 'title', 'description'] },
                    filterType: 'equals',
                    value: 'test',
                    control: { type: 'text' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _and: [
                    { name: { _eq: 'test' } },
                    { title: { _eq: 'test' } },
                    { description: { _eq: 'test' } }
                ]
            });
        });

        it('should handle and object with nested fields', () => {
            const formState: FilterState = new Map([
                ['nested-and-filter', {
                    type: 'leaf',
                    field: { and: ['user.name', 'profile.title'] },
                    filterType: 'equals',
                    value: 'test',
                    control: { type: 'text' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _and: [
                    { user: { name: { _eq: 'test' } } },
                    { profile: { title: { _eq: 'test' } } }
                ]
            });
        });

        it('should handle and object with different filter types', () => {
            const formState: FilterState = new Map([
                ['number-and-filter', {
                    type: 'leaf',
                    field: { and: ['age', 'experience'] },
                    filterType: 'greaterThan',
                    value: 25,
                    control: { type: 'number' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _and: [
                    { age: { _gt: 25 } },
                    { experience: { _gt: 25 } }
                ]
            });
        });

        it('should handle and object with array values', () => {
            const formState: FilterState = new Map([
                ['array-and-filter', {
                    type: 'leaf',
                    field: { and: ['category', 'tag'] },
                    filterType: 'in',
                    value: ['tech', 'programming'],
                    control: { type: 'multiselect', items: [] }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _and: [
                    { category: { _in: ['tech', 'programming'] } },
                    { tag: { _in: ['tech', 'programming'] } }
                ]
            });
        });
    });

    describe('or() expressions using object format', () => {
        it('should handle or object with multiple fields', () => {
            const formState: FilterState = new Map([
                ['multi-or-filter', {
                    type: 'leaf',
                    field: { or: ['name', 'title', 'description'] },
                    filterType: 'equals',
                    value: 'test',
                    control: { type: 'text' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _or: [
                    { name: { _eq: 'test' } },
                    { title: { _eq: 'test' } },
                    { description: { _eq: 'test' } }
                ]
            });
        });

        it('should handle or object with nested fields', () => {
            const formState: FilterState = new Map([
                ['nested-or-filter', {
                    type: 'leaf',
                    field: { or: ['user.email', 'user.username', 'profile.displayName'] },
                    filterType: 'iLike',
                    value: '%john%',
                    control: { type: 'text' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _or: [
                    { user: { email: { _ilike: '%john%' } } },
                    { user: { username: { _ilike: '%john%' } } },
                    { profile: { displayName: { _ilike: '%john%' } } }
                ]
            });
        });

        it('should handle or object with different filter types', () => {
            const formState: FilterState = new Map([
                ['date-or-filter', {
                    type: 'leaf',
                    field: { or: ['startDate', 'endDate'] },
                    filterType: 'greaterThan',
                    value: '2023-01-01',
                    control: { type: 'date' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _or: [
                    { startDate: { _gt: '2023-01-01' } },
                    { endDate: { _gt: '2023-01-01' } }
                ]
            });
        });
    });

    describe('single field expressions (existing behavior)', () => {
        it('should still handle single fields normally', () => {
            const formState: FilterState = new Map([
                ['single-field-filter', {
                    type: 'leaf',
                    field: 'name',
                    filterType: 'equals',
                    value: 'test',
                    control: { type: 'text' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                name: { _eq: 'test' }
            });
        });

        it('should handle nested single fields', () => {
            const formState: FilterState = new Map([
                ['nested-single-filter', {
                    type: 'leaf',
                    field: 'user.name',
                    filterType: 'equals',
                    value: 'test',
                    control: { type: 'text' }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                user: { name: { _eq: 'test' } }
            });
        });
    });

    describe('mixed expressions', () => {
        it('should handle mixture of object multi-field and single field expressions', () => {
            const formState: FilterState = new Map([
                ['multi-search-filter', {
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

            const result = buildHasuraConditions(formState);

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
    });

    describe('custom operators with object format', () => {
        it('should handle object multi-field with custom operators', () => {
            const formState: FilterState = new Map([
                ['custom-multi-filter', {
                    type: 'leaf',
                    field: { and: ['name', 'title'] },
                    filterType: 'equals', // Ignored for custom operators
                    value: { operator: '_custom_search', value: 'search_term' },
                    control: {
                        type: 'customOperator',
                        operators: [{ label: 'Custom Search', value: '_custom_search' }],
                        valueControl: { type: 'text' }
                    }
                }]
            ]);

            const result = buildHasuraConditions(formState);

            expect(result).toEqual({
                _and: [
                    { name: { _custom_search: 'search_term' } },
                    { title: { _custom_search: 'search_term' } }
                ]
            });
        });
    });
});

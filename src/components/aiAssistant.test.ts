// src/components/aiAssistant.test.ts
import { FilterSchemasAndGroups } from '../framework/filters';
import { buildInitialFormState } from '../framework/state';
import { mergeFilterFormState } from './aiAssistant';


describe('aiAssistant customOperator patching', () => {
    it('should patch customOperator values when AI returns a plain string', () => {
        // Create a filter schema with a customOperator
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'test', label: 'Test Group' }],
            filters: [
                {
                    id: 'test-filter-1',
                    label: 'Test Filter',
                    group: 'test',
                    expression: {
                        type: 'equals',
                        field: 'test',
                        value: {
                            type: 'customOperator',
                            operators: [
                                { label: 'Equals', value: '_eq' },
                                { label: 'Not Equals', value: '_neq' }
                            ],
                            valueControl: { type: 'text' }
                        }
                    },
                    aiGenerated: false
                }
            ]
        };

        // Build empty state
        const emptyState = buildInitialFormState(filterSchema.filters[0].expression);

        // AI returns a plain string instead of an object
        const aiState = {
            type: 'leaf',
            field: 'test',
            value: 'test_value'
        };

        // Apply our merge function
        const result = mergeFilterFormState(filterSchema.filters[0].expression, emptyState, aiState);

        // The result should have the string wrapped in an object with the default operator
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                operator: '_eq',
                value: 'test_value'
            });
        }
    });

    it('should not modify values when AI returns proper objects', () => {
        // Create a filter schema with a text field
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'test', label: 'Test Group' }],
            filters: [
                {
                    id: 'test-filter-2',
                    label: 'Test Filter',
                    group: 'test',
                    expression: {
                        type: 'equals',
                        field: 'test_field',
                        value: {
                            type: 'customOperator',
                            operators: [
                                { label: 'equals', value: '_eq' },
                                { label: 'not equals', value: '_neq' }
                            ],
                            valueControl: { type: 'text' }
                        }
                    },
                    aiGenerated: false
                }
            ]
        };

        // Build initial empty state
        const emptyState = buildInitialFormState(filterSchema.filters[0].expression);

        // Simulate AI returning a proper object
        const aiState = {
            type: 'leaf',
            field: 'test_field',
            value: {
                operator: '_neq',
                value: 'test_value'
            }
        };

        // Apply our merge function
        const result = mergeFilterFormState(filterSchema.filters[0].expression, emptyState, aiState);

        // The result should preserve the original object
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                operator: '_neq',
                value: 'test_value'
            });
        }
    });

    it('should not modify non-customOperator values', () => {
        // Create a filter schema with a regular text filter
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'test', label: 'Test Group' }],
            filters: [
                {
                    id: 'test-filter-3',
                    label: 'Test Filter',
                    group: 'test',
                    expression: {
                        type: 'equals',
                        field: 'test_field',
                        value: {
                            type: 'text'
                        }
                    },
                    aiGenerated: false
                }
            ]
        };

        // Build initial empty state
        const emptyState = buildInitialFormState(filterSchema.filters[0].expression);

        // Simulate AI returning a string value for a text filter
        const aiState = {
            type: 'leaf',
            field: 'test_field',
            value: 'test_value'
        };

        // Apply our merge function
        const result = mergeFilterFormState(filterSchema.filters[0].expression, emptyState, aiState);

        // The result should preserve the original string value
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toBe('test_value');
        }
    });

    it('should map NOT wrapped customOperator to not-equals operator', () => {
        // Create a filter schema with a customOperator that has not-equals
        const filterSchema: FilterSchemasAndGroups = {
            groups: [{ name: 'test', label: 'Test Group' }],
            filters: [
                {
                    id: 'test-filter-not',
                    label: 'Test Filter',
                    group: 'test',
                    expression: {
                        type: 'equals',
                        field: 'test',
                        value: {
                            type: 'customOperator',
                            operators: [
                                { label: 'Equals', value: '_eq' },
                                { label: 'Not Equals', value: '_neq' }
                            ],
                            valueControl: { type: 'text' }
                        }
                    },
                    aiGenerated: false
                }
            ]
        };

        // Build empty state
        const emptyState = buildInitialFormState(filterSchema.filters[0].expression);

        // AI returns a NOT wrapped around a leaf with string value
        const aiState = {
            type: 'not',
            child: {
                type: 'leaf',
                field: 'test',
                value: 'test_value'
            }
        };

        // Apply our merge function
        const result = mergeFilterFormState(filterSchema.filters[0].expression, emptyState, aiState);

        // The result should map to not-equals operator
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                operator: '_neq',
                value: 'test_value'
            });
        }
    });
});

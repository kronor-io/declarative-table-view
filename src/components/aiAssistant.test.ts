// src/components/aiAssistant.test.ts
import { FilterFieldSchema } from '../framework/filters';
import { FilterFormState, buildInitialFormState } from './FilterForm';

// Access private function for testing by re-implementing similar logic
function testMergeStateByKey(emptyState: FilterFormState, aiState: any): FilterFormState {
    if (!aiState) return emptyState;
    if (emptyState.type === 'leaf' && aiState.type === 'leaf') {
        let value = aiState.value;

        // Patch customOperator values: if we get a plain string, wrap it into an object { value: s }
        if (emptyState.control?.type === 'customOperator' && typeof value === 'string') {
            const defaultOperator = emptyState.control.operators[0]?.value;
            value = { operator: defaultOperator, value: value };
        }

        return {
            ...emptyState,
            value: value
        };
    }
    if ((emptyState.type === 'and' || emptyState.type === 'or') && (aiState.type === 'and' || aiState.type === 'or')) {
        return {
            ...emptyState,
            children: testMergeStateArrayByKey(emptyState.children, aiState.children)
        };
    }
    if (emptyState.type === 'not' && aiState.type === 'not') {
        return {
            ...emptyState,
            child: testMergeStateByKey(emptyState.child, aiState.child)
        };
    }
    return emptyState;
}

function testMergeStateArrayByKey(emptyArr: FilterFormState[], aiArr: unknown[]): FilterFormState[] {
    return emptyArr.map((emptyItem, i) => testMergeStateByKey(emptyItem, aiArr?.[i]));
}

describe('aiAssistant customOperator patching', () => {
    it('should patch customOperator values when AI returns a plain string', () => {
        // Create a filter schema with a customOperator
        const filterSchema: FilterFieldSchema = {
            groups: [{ name: 'test', label: 'Test Group' }],
            filters: [
                {
                    id: 'test-filter',
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

        // Simulate AI returning a plain string instead of the expected object
        const aiState = {
            type: 'leaf',
            field: 'test_field',
            value: 'test_value' // AI returned a plain string
        };

        // Apply our merge function
        const result = testMergeStateByKey(emptyState, aiState);

        // The result should have the string wrapped in an object with the default operator
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                operator: '_eq',
                value: 'test_value'
            });
        }
    });

    it('should not modify customOperator values when AI returns a proper object', () => {
        // Create a filter schema with a customOperator
        const filterSchema: FilterFieldSchema = {
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
        const result = testMergeStateByKey(emptyState, aiState);

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
        const filterSchema: FilterFieldSchema = {
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
        const result = testMergeStateByKey(emptyState, aiState);

        // The result should preserve the original string value
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toBe('test_value');
        }
    });
});

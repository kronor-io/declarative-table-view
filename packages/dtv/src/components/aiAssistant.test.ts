// src/components/aiAssistant.test.ts
import type { FilterExpr } from '../framework/filters';
import { buildInitialFormState } from '../framework/state';
import { mergeFilterFormState } from './aiAssistant';


describe('aiAssistant customOperator patching', () => {
    it('should patch customOperator values when AI returns a plain string', () => {
        const expression = {
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
        } satisfies FilterExpr;

        // Build empty state
        const emptyState = buildInitialFormState(expression);

        // AI returns a plain string instead of an object
        const aiState = {
            type: 'leaf',
            field: 'test',
            value: 'test_value'
        };

        // Apply our merge function
        const result = mergeFilterFormState(expression, emptyState, aiState);

        // The result should have the string wrapped in an object with the default operator
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                type: 'value',
                value: {
                    operator: '_eq',
                    value: {
                        type: 'value',
                        value: 'test_value'
                    }
                }
            });
        }
    });

    it('should not modify values when AI returns proper objects', () => {
        const expression = {
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
        } satisfies FilterExpr;

        // Build initial empty state
        const emptyState = buildInitialFormState(expression);

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
        const result = mergeFilterFormState(expression, emptyState, aiState);

        // The result should preserve the original object
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                type: 'value',
                value: {
                    operator: '_neq',
                    value: {
                        type: 'value',
                        value: 'test_value'
                    }
                }
            });
        }
    });

    it('should not modify non-customOperator values', () => {
        const expression = {
            type: 'equals',
            field: 'test_field',
            value: { type: 'text' }
        } satisfies FilterExpr;

        // Build initial empty state
        const emptyState = buildInitialFormState(expression);

        // Simulate AI returning a string value for a text filter
        const aiState = {
            type: 'leaf',
            field: 'test_field',
            value: 'test_value'
        };

        // Apply our merge function
        const result = mergeFilterFormState(expression, emptyState, aiState);

        // The result should preserve the original string value
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({ type: 'value', value: 'test_value' });
        }
    });

    it('should map NOT wrapped customOperator to not-equals operator', () => {
        const expression = {
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
        } satisfies FilterExpr;

        // Build empty state
        const emptyState = buildInitialFormState(expression);

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
        const result = mergeFilterFormState(expression, emptyState, aiState);

        // The result should map to not-equals operator
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({
                type: 'value',
                value: {
                    operator: '_neq',
                    value: {
                        type: 'value',
                        value: 'test_value'
                    }
                }
            });
        }
    });

    it('should collapse OR children into array for in filter', () => {
        const expression = {
            type: 'in',
            field: 'category',
            value: { type: 'text' }
        } satisfies FilterExpr;

        const emptyState = buildInitialFormState(expression);
        const aiState = {
            type: 'or',
            children: [
                { type: 'leaf', field: 'category', value: 'A' },
                { type: 'leaf', field: 'category', value: 'B' },
                { type: 'leaf', field: 'category', value: 'A' } // duplicate to test uniqueness
            ]
        };

        const result = mergeFilterFormState(expression, emptyState, aiState);
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({ type: 'value', value: ['A', 'B'] });
        }
    });

    it('should collapse OR children into array for notIn filter', () => {
        const expression = {
            type: 'notIn',
            field: 'status',
            value: { type: 'text' }
        } satisfies FilterExpr;

        const emptyState = buildInitialFormState(expression);
        const aiState = {
            type: 'or',
            children: [
                { type: 'leaf', field: 'status', value: 'NEW' },
                { type: 'leaf', field: 'status', value: 'ARCHIVED' }
            ]
        };

        const result = mergeFilterFormState(expression, emptyState, aiState);
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({ type: 'value', value: ['NEW', 'ARCHIVED'] });
        }
    });

    // Models emit 'and' for the same request that produced 'or' on the previous
    // run ("in euro or Danish krona"). Both mean the same IN list here.
    it('should collapse AND children into array for in filter', () => {
        const expression = {
            type: 'in',
            field: 'currency',
            value: { type: 'text' }
        } satisfies FilterExpr;

        const emptyState = buildInitialFormState(expression);
        const aiState = {
            type: 'and',
            children: [
                { type: 'leaf', field: 'currency', value: 'EUR' },
                { type: 'leaf', field: 'currency', value: 'DKK' }
            ]
        };

        const result = mergeFilterFormState(expression, emptyState, aiState);
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({ type: 'value', value: ['EUR', 'DKK'] });
        }
    });

    it('should collapse nested and/or children into a flat array for in filter', () => {
        const expression = {
            type: 'in',
            field: 'currency',
            value: { type: 'text' }
        } satisfies FilterExpr;

        const emptyState = buildInitialFormState(expression);
        const aiState = {
            type: 'and',
            children: [
                { type: 'leaf', field: 'currency', value: 'EUR' },
                {
                    type: 'or',
                    children: [
                        { type: 'leaf', field: 'currency', value: 'DKK' },
                        { type: 'leaf', field: 'currency', value: 'NOK' }
                    ]
                }
            ]
        };

        const result = mergeFilterFormState(expression, emptyState, aiState);
        expect(result.type).toBe('leaf');
        if (result.type === 'leaf') {
            expect(result.value).toEqual({ type: 'value', value: ['EUR', 'DKK', 'NOK'] });
        }
    });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { buildInitialFormState, FormStateInitMode } from '../framework/state';
import { FilterExpr } from '../framework/filters';
import * as FilterValue from '../framework/filterValue';

describe('FilterForm state builders', () => {
    describe('buildInitialFormState vs buildEmptyFormState', () => {
        it('buildInitialFormState uses initialValue when available', () => {
            const expr: FilterExpr = {
                type: 'equals',
                field: 'test',
                value: {
                    type: 'text',
                    initialValue: 'default-value'
                }
            };

            const initialState = buildInitialFormState(expr);
            expect(initialState).toEqual({
                type: 'leaf',
                value: { type: 'value', value: 'default-value' }
            });
        });

        it('both functions handle expressions without initialValue the same way', () => {
            const expr: FilterExpr = {
                type: 'equals',
                field: 'test',
                value: {
                    type: 'text'
                }
            };

            const initialState = buildInitialFormState(expr);
            const emptyState = buildInitialFormState(expr, FormStateInitMode.Empty);

            expect(FilterValue.isEmpty((initialState as any).value)).toBe(true);
            expect(FilterValue.isEmpty((emptyState as any).value)).toBe(true);
        });

        it('buildInitialFormState with mode=Empty handles complex nested expressions', () => {
            const expr: FilterExpr = {
                type: 'and',
                filters: [
                    {
                        type: 'equals',
                        field: 'field1',
                        value: {
                            type: 'text',
                            initialValue: 'value1'
                        }
                    },
                    {
                        type: 'not',
                        filter: {
                            type: 'equals',
                            field: 'field2',
                            value: {
                                type: 'text',
                                initialValue: 'value2'
                            }
                        }
                    }
                ]
            };

            const emptyState = buildInitialFormState(expr, FormStateInitMode.Empty);
            expect(emptyState.type).toBe('and');
            expect((emptyState as any).children).toHaveLength(2);

            // First child should be empty
            expect(FilterValue.isEmpty((emptyState as any).children[0].value)).toBe(true);

            // Second child is a NOT expression, check its nested child
            expect((emptyState as any).children[1].type).toBe('not');
            expect(FilterValue.isEmpty((emptyState as any).children[1].child.value)).toBe(true);
        });
    });
});

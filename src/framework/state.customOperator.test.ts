/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { buildInitialFormState, FormStateInitMode } from './state';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import * as FilterValue from './filterValue';

describe('buildInitialFormState customOperator handling', () => {
    it('should build initial state object with operator and nested value (valueControl initialValue)', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'Equals', value: '_eq' }],
                valueControl: { type: 'text', initialValue: 'abc' }
            })
        });

        const formState = buildInitialFormState(expr, FormStateInitMode.WithInitialValues);
        expect(formState).toEqual({
            type: 'leaf',
            value: FilterValue.value({ operator: '_eq', value: FilterValue.value('abc') })
        });
    });

    it('should prioritize top-level customOperator initialValue over valueControl initialValue', () => {
        const expr = FilterExpr.equals({
            field: 'field',
            control: {
                type: 'customOperator',
                operators: [{ label: 'Equals', value: '_eq' }],
                valueControl: { type: 'text', initialValue: 'nested' },
                initialValue: 'top'
            }
        });
        const formState = buildInitialFormState(expr, FormStateInitMode.WithInitialValues);
        expect(formState).toEqual({
            type: 'leaf',
            value: FilterValue.value({ operator: '_eq', value: FilterValue.value('top') })
        });
    });

    it('should build a state node with operator and empty value in Empty mode', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'Equals', value: '_eq' }],
                valueControl: { type: 'text', initialValue: 'abc' }
            })
        });
        const formState = buildInitialFormState(expr, FormStateInitMode.Empty);
        expect(formState).toEqual({
            type: 'leaf',
            value: FilterValue.value({ operator: '_eq', value: FilterValue.empty })
        });
    });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { buildInitialFormState, FormStateInitMode } from '../framework/state';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import { isFilterEmpty } from '../framework/filter-form-state';

/**
 * Tests focusing on customOperator emptiness detection logic.
 */

describe('isFilterEmpty with customOperator', () => {
    it('treats empty customOperator (inner value empty string) as empty', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'Equals', value: '_eq' }],
                valueControl: { type: 'text', initialValue: 'preset' }
            })
        });
        // Build in Empty mode so inner value becomes ''
        const state = buildInitialFormState(expr, FormStateInitMode.Empty);
        expect(state.type).toBe('leaf');
        expect((state as any).value).toEqual({ operator: '_eq', value: '' });
        expect(isFilterEmpty(state, expr)).toBe(true);
    });

    it('treats populated customOperator (inner value non-empty) as not empty', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'Equals', value: '_eq' }],
                valueControl: { type: 'text' }
            })
        });
        const state = buildInitialFormState(expr, FormStateInitMode.Empty);
        // Simulate user entering a value
        (state as any).value.value = 'abc';
        expect(isFilterEmpty(state, expr)).toBe(false);
    });

    it('treats array value [] as empty and non-empty array as populated', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'in', value: '_in' }],
                valueControl: { type: 'multiselect', items: [{ label: 'A', value: 'A' }] }
            })
        });
        const state = buildInitialFormState(expr, FormStateInitMode.Empty);
        // In empty mode nested value is '' so first make it array scenarios
        (state as any).value.value = [];
        expect(isFilterEmpty(state, expr)).toBe(true);
        (state as any).value.value = ['A'];
        expect(isFilterEmpty(state, expr)).toBe(false);
    });
});

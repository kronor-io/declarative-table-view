/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { buildInitialFormState, FormStateInitMode } from '../framework/state';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import { isFilterEmpty } from '../framework/filter-form-state';
import * as FilterValue from '../framework/filterValue';

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
        // Build in Empty mode so inner value becomes FilterValue.empty
        const state = buildInitialFormState(expr, FormStateInitMode.Empty);
        expect(state.type).toBe('leaf');
        expect(FilterValue.isEmpty(FilterValue.flatMap(
            value => (value as { operator: string; value: FilterValue.FilterValue }).value,
            (state as any).value
        ))).toBe(true);
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
        (state as any).value = FilterValue.value({ operator: '_eq', value: 'abc' });
        expect(isFilterEmpty(state, expr)).toBe(false);
    });

    it('treats operator set but inner value empty as empty', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'Equals', value: '_eq' }],
                valueControl: { type: 'text' }
            })
        });
        const state = buildInitialFormState(expr, FormStateInitMode.Empty);
        (state as any).value = FilterValue.value({ operator: '_eq', value: FilterValue.empty });
        expect(isFilterEmpty(state, expr)).toBe(true);
    });

    it('treats empty multiselect as empty and non-empty array as populated', () => {
        const expr = FilterExpr.equals({
            field: 'field', control: FilterControl.customOperator({
                operators: [{ label: 'in', value: '_in' }],
                valueControl: { type: 'multiselect', items: [{ label: 'A', value: 'A' }] }
            })
        });
        const state = buildInitialFormState(expr, FormStateInitMode.Empty);
        // Under the writer invariant, empty inner values should be represented as FilterValue.empty.
        (state as any).value = FilterValue.empty;
        expect(isFilterEmpty(state, expr)).toBe(true);
        (state as any).value = FilterValue.value({ operator: '_in', value: ['A'] });
        expect(isFilterEmpty(state, expr)).toBe(false);
    });
});

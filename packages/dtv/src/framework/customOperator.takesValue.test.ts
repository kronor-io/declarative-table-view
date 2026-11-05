/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import type { FilterGroups, FilterSchema } from './filters';
import { buildInitialFormState, FormStateInitMode } from './state';
import { decodeFilterState, encodeFilterState, isFilterEmpty } from './filter-form-state';
import * as FilterValue from './filterValue';
import { formatControlValue } from '../components/controlFormat';
import { getFilterStatePillItems } from '../components/filterStatePills.utils';
import { mergeFilterFormState } from '../components/aiAssistant';

// A comment filter as an app builds it: text operators, then operators that filter without a value.
const control = FilterControl.customOperator({
    operators: [
        { label: 'is empty', value: 'isEmpty', takesValue: false },
        { label: 'contains', value: 'contains' },
        { label: 'is not empty', value: 'isNotEmpty', takesValue: false }
    ],
    valueControl: FilterControl.text()
});
const expression = FilterExpr.equals({ field: 'comment', fieldLabel: 'Comment', control });
const filter: FilterSchema = { id: 'comment', label: 'Comment', expression, aiGenerated: false };
const groups: FilterGroups = [{ name: 'default', label: null, filters: [filter] }];

const isEmptyLeaf = { type: 'leaf' as const, value: FilterValue.value({ operator: 'isEmpty', value: FilterValue.empty }) };

describe('customOperator operators that take no value', () => {
    it('starts a new filter with the first operator that takes a value', () => {
        expect(buildInitialFormState(expression, FormStateInitMode.Empty)).toEqual({
            type: 'leaf',
            value: FilterValue.value({ operator: 'contains', value: FilterValue.empty })
        });
    });

    it('counts a leaf with such an operator as set, and other operators as set only with a value', () => {
        expect(isFilterEmpty(isEmptyLeaf, expression)).toBe(false);
        expect(isFilterEmpty({
            type: 'leaf',
            value: FilterValue.value({ operator: 'contains', value: FilterValue.empty })
        }, expression)).toBe(true);
    });

    it('keeps such a filter through encoding and decoding', () => {
        const encoded = encodeFilterState(new Map([['comment', isEmptyLeaf]]), groups);
        expect(encoded).toEqual({
            comment: { type: 'leaf', value: { type: 'value', value: { operator: 'isEmpty', value: { type: 'empty' } } } }
        });
        expect(decodeFilterState(encoded, groups).state.get('comment')).toEqual(isEmptyLeaf);
    });

    it('decodes a stored filter with such an operator to no value, dropping what else was stored', () => {
        const decoded = decodeFilterState({
            comment: {
                type: 'leaf',
                value: { type: 'value', value: { operator: 'isNotEmpty', value: { type: 'value', value: 'abc' }, label: 'is not empty' } }
            }
        }, groups);
        expect(decoded.resetFilterIds).toEqual([]);
        expect(decoded.state.get('comment')).toEqual({
            type: 'leaf',
            value: FilterValue.value({ operator: 'isNotEmpty', value: FilterValue.empty })
        });
    });

    it('shows the operator alone in the value and the pill', () => {
        expect(formatControlValue(control, { operator: 'isEmpty', value: FilterValue.empty })).toBe('is empty');
        expect(getFilterStatePillItems(new Map([['comment', isEmptyLeaf]]), [filter])).toEqual([
            { filterId: 'comment', displayText: 'Comment is empty' }
        ]);
    });

    it('lets the AI assistant pick such an operator without a value', () => {
        const merged = mergeFilterFormState(expression, buildInitialFormState(expression), {
            type: 'leaf',
            value: { operator: 'isNotEmpty', value: null }
        });
        expect(merged).toEqual({
            type: 'leaf',
            value: FilterValue.value({ operator: 'isNotEmpty', value: FilterValue.empty })
        });
    });
});

import { describe, expect, it } from '@jest/globals';
import * as FilterValue from '../framework/filterValue';
import { formatControlValue } from './controlFormat';
import { FilterControl } from '../dsl/filterControl';

const noSuggestions = async () => [];

describe('formatControlValue', () => {
    it('groups a number and keeps its fraction digits, as InputNumber does', () => {
        expect(formatControlValue({ type: 'number' }, 1234567.125)).toBe('1,234,567.125');
    });

    it('shows a date in the Calendar pattern, with time unless showTime is off', () => {
        const value = new Date(2026, 9, 1, 9, 5);
        expect(formatControlValue({ type: 'date' }, value)).toBe('2026-10-01 09:05');
        expect(formatControlValue({ type: 'date', showTime: false }, value)).toBe('2026-10-01');
    });

    it('shows the labels of dropdown and multiselect items', () => {
        const items = [{ label: 'Active', value: 'active' }, { label: 'Archived', value: 'archived' }];
        expect(formatControlValue({ type: 'dropdown', items }, 'archived')).toBe('Archived');
        expect(formatControlValue({ type: 'multiselect', items }, ['active', 'archived'])).toBe('Active, Archived');
    });

    it('shows an item no longer in the list as its value', () => {
        expect(formatControlValue({ type: 'dropdown', items: [{ label: 'Active', value: 'active' }] }, 'deleted')).toBe('deleted');
    });

    it('shows the suggestionLabelField of an autocomplete selection', () => {
        const control = FilterControl.autocomplete({ suggestionFetcher: noSuggestions, suggestionLabelField: 'name' });
        expect(formatControlValue(control, { label: 'ignored', name: 'Jane Doe' })).toBe('Jane Doe');
        expect(formatControlValue({ ...control, multiple: true }, [{ name: 'Jane' }, { name: 'John' }])).toBe('Jane, John');
    });

    it('formats a customOperator\'s value with its value control', () => {
        const control = FilterControl.customOperator({
            operators: [{ label: 'after', value: '_gt' }],
            valueControl: FilterControl.date({ showTime: false })
        });
        const value = { operator: '_gt', value: FilterValue.value(new Date(2026, 9, 1)) };
        expect(formatControlValue(control, value)).toBe('after 2026-10-01');
    });

    it('guesses from the value\'s shape for a custom control', () => {
        const control = { type: 'custom' as const, component: () => null };
        expect(formatControlValue(control, { label: 'Sweden' })).toBe('Sweden');
        expect(formatControlValue(control, { value: '+46' })).toBe('+46');
        expect(formatControlValue(control, { countryCode: 'SE' })).toBe('{"countryCode":"SE"}');
    });
});

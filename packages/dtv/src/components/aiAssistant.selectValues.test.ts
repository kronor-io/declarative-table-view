// src/components/aiAssistant.selectValues.test.ts
import type { FilterExpr } from '../framework/filters';
import { buildInitialFormState } from '../framework/state';
import * as FilterValue from '../framework/filterValue';
import { mergeFilterFormState } from './aiAssistant';

const currencyItems = [
    { label: 'DKK', value: 'DKK' },
    { label: 'EUR', value: 'EUR' },
    { label: 'Swedish krona', value: 'SEK' }
];

const currencyIn = {
    type: 'in',
    field: 'currency',
    value: { type: 'multiselect', items: currencyItems }
} satisfies FilterExpr;

const statusEquals = {
    type: 'equals',
    field: 'status',
    value: {
        type: 'dropdown',
        items: [
            { label: 'Paid', value: 'PAID' },
            { label: 'Declined', value: 'DECLINED' }
        ]
    }
} satisfies FilterExpr;

function leafValue(expr: FilterExpr, aiState: unknown) {
    const result = mergeFilterFormState(expr, buildInitialFormState(expr), aiState);
    if (result.type !== 'leaf') throw new Error('expected a leaf');
    return result.value;
}

describe('aiAssistant dropdown/multiselect values', () => {
    it('maps a mix of an item object and a plain value to item values, without duplicates', () => {
        const value = leafValue(currencyIn, {
            type: 'leaf',
            value: [{ label: 'DKK', value: 'DKK' }, 'DKK']
        });
        expect(value).toEqual(FilterValue.value(['DKK']));
    });

    it('maps a label to its item value, ignoring case', () => {
        const value = leafValue(currencyIn, { type: 'leaf', value: ['swedish KRONA', 'EUR'] });
        expect(value).toEqual(FilterValue.value(['SEK', 'EUR']));
    });

    it('drops values that match no item', () => {
        expect(leafValue(currencyIn, { type: 'leaf', value: ['USD', 'EUR'] }))
            .toEqual(FilterValue.value(['EUR']));
        expect(leafValue(currencyIn, { type: 'leaf', value: ['USD'] }))
            .toEqual(FilterValue.empty);
    });

    it('maps an item object for a dropdown to its single value', () => {
        expect(leafValue(statusEquals, { type: 'leaf', value: { label: 'Paid', value: 'PAID' } }))
            .toEqual(FilterValue.value('PAID'));
        expect(leafValue(statusEquals, { type: 'leaf', value: 'nonsense' }))
            .toEqual(FilterValue.empty);
    });

    it('maps values when collapsing an or/and tree into a list', () => {
        const value = leafValue(currencyIn, {
            type: 'or',
            children: [
                { type: 'leaf', value: { label: 'DKK', value: 'DKK' } },
                { type: 'leaf', value: 'DKK' },
                { type: 'leaf', value: 'eur' },
                { type: 'leaf', value: 'USD' }
            ]
        });
        expect(value).toEqual(FilterValue.value(['DKK', 'EUR']));
    });
});

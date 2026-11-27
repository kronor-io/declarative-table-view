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

const cardsItems = [
    { label: 'Cards', value: [68, 70] },
    { label: 'Swish', value: [12] }
];

const cardsEquals = {
    type: 'equals',
    field: 'paymentMethod',
    value: { type: 'dropdown', items: cardsItems }
} satisfies FilterExpr;

const cardsIn = {
    type: 'in',
    field: 'paymentMethod',
    value: { type: 'dropdown', items: cardsItems }
} satisfies FilterExpr;

const statusIn = {
    type: 'in',
    field: 'status',
    value: { type: 'dropdown', items: statusEquals.value.items }
} satisfies FilterExpr;

describe('aiAssistant dropdown/multiselect values', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
    });

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

    it('keeps a list that is itself an item value of a dropdown, under equals and under in', () => {
        expect(leafValue(cardsEquals, { type: 'leaf', value: [68, 70] }))
            .toEqual(FilterValue.value([68, 70]));
        expect(leafValue(cardsIn, { type: 'leaf', value: [68, 70] }))
            .toEqual(FilterValue.value([68, 70]));
        expect(leafValue(cardsIn, { type: 'leaf', value: { label: 'Cards', value: [68, 70] } }))
            .toEqual(FilterValue.value([68, 70]));
    });

    it('keeps a single value for a dropdown under in, also when collapsing an or tree', () => {
        expect(leafValue(statusIn, { type: 'leaf', value: ['PAID', 'DECLINED'] }))
            .toEqual(FilterValue.value('PAID'));
        expect(leafValue(statusIn, {
            type: 'or',
            children: [{ type: 'leaf', value: 'Declined' }, { type: 'leaf', value: 'PAID' }]
        })).toEqual(FilterValue.value('DECLINED'));
    });

    it('matches values that differ only in case or type, and objects in another key order', () => {
        const expr = {
            type: 'in',
            field: 'x',
            value: {
                type: 'multiselect',
                items: [
                    { label: 'Card', value: 'CARD' },
                    { label: 'Five', value: 5 },
                    { label: 'No', value: false },
                    { label: 'Pair', value: { a: 1, b: 2 } }
                ]
            }
        } satisfies FilterExpr;
        expect(leafValue(expr, { type: 'leaf', value: ['card', '5', 'false', { b: 2, a: 1 }] }))
            .toEqual(FilterValue.value(['CARD', 5, false, { a: 1, b: 2 }]));
    });

    it('flattens a list inside an or tree leaf', () => {
        expect(leafValue(currencyIn, {
            type: 'or',
            children: [{ type: 'leaf', value: ['DKK', 'EUR'] }, { type: 'leaf', value: 'SEK' }]
        })).toEqual(FilterValue.value(['DKK', 'EUR', 'SEK']));
    });

    it('warns about the values it drops', () => {
        leafValue(currencyIn, { type: 'leaf', value: ['USD', 'EUR'] });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropped values'), 'currency', ['USD']);
    });
});

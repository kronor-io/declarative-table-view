import { describe, it, expect } from '@jest/globals';
import type { GraphQLClient } from 'graphql-request';
import { FilterControl, type ControlValue } from './filterControl';
import { FilterExpr } from './filterExpr';
import { PhoneNumberFilter } from '../components/PhoneNumberFilter';
import { TransformResult } from '../framework/filters';
import type * as FilterValue from '../framework/filterValue';

// What each control hands to its query transform. Mirrors `renderInput` in
// components/FilterForm.tsx — if that changes, these should change with it.

/** `true` when `Actual` is exactly `Expected`, otherwise `never`. */
type Exactly<Actual, Expected> = [Actual] extends [Expected]
    ? [Expected] extends [Actual] ? true : never
    : never;

const suggest = async (query: string, client: GraphQLClient) => {
    void query;
    void client;
    return [{ label: 'SE', value: 46 }];
};

const controls = {
    text: FilterControl.text(),
    number: FilterControl.number(),
    date: FilterControl.date(),
    dropdown: FilterControl.dropdown({ items: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }),
    multiselect: FilterControl.multiselect({ items: [{ label: 'One', value: 1 }] }),
    customOperator: FilterControl.customOperator({
        operators: [{ label: 'equals', value: '_eq' }, { label: 'greater than', value: '_gt' }],
        valueControl: FilterControl.number()
    }),
    autocomplete: FilterControl.autocomplete({ suggestionFetcher: suggest }),
    autocompleteMultiple: FilterControl.autocomplete({ suggestionFetcher: suggest, multiple: true }),
    custom: FilterControl.custom(PhoneNumberFilter),
    // Items assembled at runtime are widened, and so is the value they stand for.
    runtimeItems: FilterControl.dropdown({ items: ['a', 'b'].map(value => ({ label: value, value })) })
};

describe('dsl/filterControl ControlValue', () => {
    it('resolves the value each control produces', () => {
        const checks = [
            true satisfies Exactly<ControlValue<typeof controls.text>, string>,
            true satisfies Exactly<ControlValue<typeof controls.number>, number | null>,
            true satisfies Exactly<ControlValue<typeof controls.date>, Date>,
            true satisfies Exactly<ControlValue<typeof controls.dropdown>, 'a' | 'b'>,
            true satisfies Exactly<ControlValue<typeof controls.multiselect>, 1[]>,
            true satisfies Exactly<
                ControlValue<typeof controls.customOperator>,
                { operator: '_eq' | '_gt'; value: FilterValue.FilterValue }
            >,
            // the fetcher's own item type, not the bare SuggestionItem
            true satisfies Exactly<ControlValue<typeof controls.autocomplete>, { label: string; value: number }>,
            true satisfies Exactly<ControlValue<typeof controls.autocompleteMultiple>, { label: string; value: number }[]>,
            // taken from the component's onChange
            true satisfies Exactly<ControlValue<typeof controls.custom>, string>,
            true satisfies Exactly<ControlValue<typeof controls.runtimeItems>, string>
        ];

        expect(checks.every(Boolean)).toBe(true);
        expect(Object.values(controls).map(control => control.type)).toContain('customOperator');
    });

    it('types a transform input from the control beside it', () => {
        FilterExpr.equals({
            field: 'amount',
            control: FilterControl.number(),
            transform: { toQuery: input => TransformResult.value(input === null ? null : input * 100) }
        });

        FilterExpr.iLike({
            field: 'reference',
            control: FilterControl.autocomplete({ suggestionFetcher: suggest }),
            transform: { toQuery: input => TransformResult.value(input.value) }
        });

        FilterExpr.equals({
            field: 'amount',
            control: FilterControl.customOperator({
                operators: [{ label: 'equals', value: '_eq' }],
                valueControl: FilterControl.number()
            }),
            // The operator is narrowed to the ones the control offers.
            transform: { toQuery: (input, context) => context.transform.hasuraCustomOperator.toQuery(input, context) }
        });

        FilterExpr.equals({
            field: 'amount',
            control: FilterControl.number(),
            // @ts-expect-error a number control does not produce a string
            transform: { toQuery: (input: string) => TransformResult.value(input) }
        });

        FilterExpr.equals({
            field: 'reference',
            control: FilterControl.text(),
            // @ts-expect-error a text control produces a string, which has no toFixed
            transform: { toQuery: input => TransformResult.value(input.toFixed(2)) }
        });
    });

    it('types each control\'s initialValue as the value that control produces', () => {
        FilterControl.text({ initialValue: 'SE-1001' });
        FilterControl.number({ initialValue: 1000 });
        FilterControl.date({ initialValue: new Date('2026-01-01') });
        FilterControl.dropdown({ items: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], initialValue: 'b' });
        FilterControl.multiselect({ items: [{ label: 'One', value: 1 }], initialValue: [1] });
        FilterControl.autocomplete({ suggestionFetcher: suggest, initialValue: { label: 'SE', value: 46 } });
        FilterControl.autocomplete({ suggestionFetcher: suggest, multiple: true, initialValue: [{ label: 'SE', value: 46 }] });
        FilterControl.custom(PhoneNumberFilter, { initialValue: '+46' });

        // customOperator seeds the inner value, not the { operator, value } pair
        FilterControl.customOperator({
            operators: [{ label: 'equals', value: '_eq' }],
            valueControl: FilterControl.number(),
            initialValue: 7
        });

        // @ts-expect-error a text control starts from a string
        FilterControl.text({ initialValue: 42 });
        // @ts-expect-error a date control starts from a Date, not an ISO string
        FilterControl.date({ initialValue: '2026-01-01' });
        FilterControl.dropdown({
            items: [{ label: 'A', value: 'a' }],
            // @ts-expect-error 'bogus' is not one of the items
            initialValue: 'bogus'
        });
        FilterControl.multiselect({
            items: [{ label: 'One', value: 1 }],
            // @ts-expect-error a multiselect starts from a list of item values
            initialValue: 1
        });
        FilterControl.customOperator({
            operators: [{ label: 'equals', value: '_eq' }],
            valueControl: FilterControl.number(),
            // @ts-expect-error the inner control takes a number
            initialValue: 'seven'
        });
    });

    it('still checks item values when an initialValue is present', () => {
        FilterControl.dropdown({ items: [{ label: 'A', value: 'a' }], initialValue: 'a' }) satisfies { items: [{ label: 'A'; value: 'a' }] };
    });
});

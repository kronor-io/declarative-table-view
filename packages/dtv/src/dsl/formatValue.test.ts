import { describe, it, expect } from '@jest/globals';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filterExprForRowType } from './filterExprForRow';
import { filter } from './filters';
import { rowType } from './columns';
import { TransformResult, type FilterValueFormatter } from '../framework/filters';
import { Hasura } from '../framework/graphql';

// A leaf's formatValue is typed by its control, like a transform's input, but
// unlike a transform it does not change what reaches the query, so the leaf
// stays checked.

/** `true` when `Actual` is exactly `Expected`, otherwise `never`. */
type Exactly<Actual, Expected> = [Actual] extends [Expected]
    ? [Expected] extends [Actual] ? true : never
    : never;

type Row = { amount: number | null; reference: string };
const Row = rowType<Row>();

const format = { format: (value: unknown) => String(value) };

describe('dsl formatValue', () => {
    it('types its input by the control', () => {
        const leaf = FilterExpr.equals({
            field: 'amount',
            control: FilterControl.number(),
            formatValue: input => {
                const typed: Exactly<typeof input, number | null> = true;
                void typed;
                return `${input} SEK`;
            }
        });

        expect(leaf.formatValue?.(15, format)).toBe('15 SEK');
    });

    it('rejects a formatter for another control\'s value', () => {
        FilterExpr.equals({
            field: 'reference',
            control: FilterControl.text(),
            // @ts-expect-error a text control does not produce a number
            formatValue: (input: number) => input.toFixed(2)
        });
    });

    it('is kept next to a transform', () => {
        const toCents = { toQuery: (input: number | null) => TransformResult.value(input === null ? null : input * 100) };
        const formatValue: FilterValueFormatter<number | null> = input => `${input} SEK`;

        const leaf = FilterExpr.equals({ field: 'amount', control: FilterControl.number(), formatValue, transform: toCents });
        expect(leaf).toEqual({ type: 'equals', field: 'amount', value: { type: 'number' }, formatValue, transform: toCents });
    });

    it('formats both bounds of a range', () => {
        const formatValue: FilterValueFormatter<number | null> = input => `${input} SEK`;

        const ranged = FilterExpr.range({ field: 'amount', control: FilterControl.number, formatValue });
        expect(ranged.filters.map(bound => bound.formatValue)).toEqual([formatValue, formatValue]);
    });

    it('is carried by the row-scoped builder and computedCondition', () => {
        const F = filterExprForRowType(Row);
        const formatValue: FilterValueFormatter<number | null> = input => `${input} SEK`;

        expect(F.equals({ field: 'amount', control: FilterControl.number(), formatValue }).formatValue).toBe(formatValue);
        expect(F.range({ field: 'amount', control: FilterControl.number, formatValue }).filters[0].formatValue).toBe(formatValue);

        const computed = F.computedCondition({
            control: FilterControl.number(),
            fieldLabel: 'Amount',
            formatValue,
            transform: { toQuery: () => TransformResult.condition(Hasura.empty()) }
        });
        expect(computed.formatValue).toBe(formatValue);
    });

    it('does not exempt the leaf from the row checks', () => {
        filter({
            rowType: Row,
            id: 'reference',
            label: 'Reference',
            // @ts-expect-error a number control cannot produce a value for a text column
            expression: FilterExpr.equals({ field: 'reference', control: FilterControl.number(), formatValue: input => `${input}` })
        });
    });
});

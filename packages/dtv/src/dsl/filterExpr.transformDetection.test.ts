import { describe, it, expect } from '@jest/globals';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filterExprForRowType } from './filterExprForRow';
import { rowType } from './columns';
import { filter } from './filters';
import { TransformResult, type FilterTransform } from '../framework/filters';

// Whether a leaf's type carries a transform decides whether it is exempt from
// the checks in ./filterTyping. `FilterExpr`'s leaf builders decide it by
// overload — one for no transform, one for a transform — so getting it wrong in
// either direction would silently exempt a leaf or wrongly check one. Every way
// a transform can arrive is pinned down here.

type Row = { amount: number | null };
const Row = rowType<Row>();

type HasTransform<Leaf> = 'transform' extends keyof Leaf ? true : false;

/** `true` when the leaf's type reports exactly `Want`, otherwise `never`. */
type ExpectTransform<Leaf, Want extends boolean> = HasTransform<Leaf> extends Want
    ? Want extends HasTransform<Leaf> ? true : never
    : never;

const annotatedWide: FilterTransform<any> = { toQuery: input => TransformResult.value(input) };
const annotatedDefault: FilterTransform = { toQuery: input => TransformResult.value(input) };
const inferred = { toQuery: (input: unknown) => TransformResult.value(input) };
// Typed exactly as the control's value: the shape an omitted transform used to infer.
const annotatedExact: FilterTransform<number | null> = { toQuery: input => TransformResult.value(input) };

describe('dsl/filterExpr transform detection', () => {
    it('sees no transform when none was passed', () => {
        const leaf = FilterExpr.equals({ field: 'amount', control: FilterControl.number() });

        const seen: ExpectTransform<typeof leaf, false> = true;
        expect(seen).toBe(true);
        expect('transform' in leaf).toBe(false);
    });

    it('sees no transform when it is passed as undefined', () => {
        const leaf = FilterExpr.equals({ field: 'amount', control: FilterControl.number(), transform: undefined });

        const seen: ExpectTransform<typeof leaf, false> = true;
        expect(seen).toBe(true);
        expect('transform' in leaf).toBe(false);
    });

    it('sees no transform on a leaf nested in a tree', () => {
        // The contextual type of an and() element offers `transform?:
        // FilterTransform`, which must not be taken for a real one.
        const tree = FilterExpr.and({ filters: [FilterExpr.equals({ field: 'amount', control: FilterControl.number() })] });

        const seen: ExpectTransform<typeof tree.filters[0], false> = true;
        expect(seen).toBe(true);
        expect('transform' in tree.filters[0]).toBe(false);
    });

    it('sees an inline transform', () => {
        const leaf = FilterExpr.equals({
            field: 'amount',
            control: FilterControl.number(),
            transform: { toQuery: input => TransformResult.value(input) }
        });

        const seen: ExpectTransform<typeof leaf, true> = true;
        expect(seen).toBe(true);
        expect('transform' in leaf).toBe(true);
    });

    it('sees a transform passed as a value, however it was declared', () => {
        const wide = FilterExpr.equals({ field: 'amount', control: FilterControl.number(), transform: annotatedWide });
        const declared = FilterExpr.equals({ field: 'amount', control: FilterControl.number(), transform: annotatedDefault });
        const literal = FilterExpr.equals({ field: 'amount', control: FilterControl.number(), transform: inferred });
        const exact = FilterExpr.equals({ field: 'amount', control: FilterControl.number(), transform: annotatedExact });

        const seenWide: ExpectTransform<typeof wide, true> = true;
        const seenDeclared: ExpectTransform<typeof declared, true> = true;
        const seenLiteral: ExpectTransform<typeof literal, true> = true;
        const seenExact: ExpectTransform<typeof exact, true> = true;
        expect([seenWide, seenDeclared, seenLiteral, seenExact]).toEqual([true, true, true, true]);
        expect([wide, declared, literal, exact].every(leaf => 'transform' in leaf)).toBe(true);
    });

    it('exempts a leaf whose transform is typed exactly as its control value', () => {
        // A number control cannot filter a text column, unless a transform turns the number into text.
        const toText: FilterTransform<number | null> = { toQuery: input => TransformResult.value(String(input)) };

        const schema = filter({
            rowType: rowType<{ reference: string }>(),
            id: 'reference',
            label: 'Reference',
            expression: FilterExpr.equals({ field: 'reference', control: FilterControl.number(), transform: toText })
        });
        expect(schema.expression).toEqual({ type: 'equals', field: 'reference', value: { type: 'number' }, transform: toText });
    });

    it('rejects a transform without toQuery', () => {
        // @ts-expect-error a transform does nothing without toQuery
        FilterExpr.equals({ field: 'amount', control: FilterControl.number(), transform: {} });
        // @ts-expect-error a transform does nothing without toQuery
        FilterExpr.range({ field: 'amount', control: FilterControl.number, transform: {} });

        const F = filterExprForRowType(Row);
        // @ts-expect-error a transform does nothing without toQuery
        F.equals({ field: 'amount', control: FilterControl.number() }, {});

        // A leaf written out by hand rather than built.
        filter({
            rowType: Row,
            id: 'amount',
            label: 'Amount',
            // @ts-expect-error a transform does nothing without toQuery
            expression: { type: 'equals', field: 'amount', value: { type: 'number' }, transform: {} }
        });
    });

    it('carries the transform through the row-scoped builder', () => {
        const F = filterExprForRowType(Row);
        const toText = { toQuery: (input: number | null) => TransformResult.value(String(input)) };

        const leaf = F.iLike({ field: 'amount', control: FilterControl.number() }, toText);
        const seen: ExpectTransform<typeof leaf, true> = true;
        expect(seen).toBe(true);
        expect(leaf).toEqual({ type: 'iLike', field: 'amount', value: { type: 'number' }, transform: toText });

        const plain = F.greaterThan({ field: 'amount', control: FilterControl.number() });
        const seenPlain: ExpectTransform<typeof plain, false> = true;
        expect(seenPlain).toBe(true);
        expect('transform' in plain).toBe(false);

        const ranged = F.range({ field: 'amount', control: FilterControl.number }, toText);
        expect(ranged.filters.map(bound => bound.transform)).toEqual([toText, toText]);
    });
});

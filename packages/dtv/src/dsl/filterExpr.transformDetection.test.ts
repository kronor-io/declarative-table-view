import { describe, it, expect } from '@jest/globals';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filterExprForRowType } from './filterExprForRow';
import { rowType } from './columns';
import { TransformResult, type FilterTransform } from '../framework/filters';

// `FilterExpr`'s leaf builders decide from the transform's *type* whether one
// was passed, because typing its `input` forces the transform to be a type
// parameter (see IsTransformed). Getting that wrong in the permissive
// direction would silently exempt leaves from the checks in ./filterTyping, so
// every way a transform can arrive is pinned down here.

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

describe('dsl/filterExpr transform detection', () => {
    it('sees no transform when none was passed', () => {
        const leaf = FilterExpr.equals({ field: 'amount', control: FilterControl.number() });

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

        const seenWide: ExpectTransform<typeof wide, true> = true;
        const seenDeclared: ExpectTransform<typeof declared, true> = true;
        const seenLiteral: ExpectTransform<typeof literal, true> = true;
        expect([seenWide, seenDeclared, seenLiteral]).toEqual([true, true, true]);
        expect([wide, declared, literal].every(leaf => 'transform' in leaf)).toBe(true);
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

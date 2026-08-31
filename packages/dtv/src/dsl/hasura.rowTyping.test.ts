import { describe, it, expect } from '@jest/globals';
import { rowType } from './columns';
import { hasuraDSLforRowType } from './hasura';
import { TransformResult } from '../framework/filters';

type ExampleRow = {
    id: string;
    amount: number | null;
    customer?: {
        email: string | null;
        name: string;
    } | null;
    lines: Array<{
        sku: string;
        qty: number | null;
    }>;
};

describe('dsl/hasura row-aware typing', () => {
    it('typechecks paths and operator/value compatibility', () => {
        const H = hasuraDSLforRowType(rowType<ExampleRow>());

        // Valid paths
        const c1 = H.condition('id', H.eq('abc'));
        const c2 = H.condition('customer.email', H.ilike('%@boozt%'));
        const c3 = H.condition('lines.sku', H.like('%SKU%'));
        const c4 = H.condition('lines.qty', H.gt(1));

        // Nullable fields: allow eq(null) (Hasura supports _eq: null)
        H.condition('customer.email', H.eq(null));
        H.condition('amount', H.eq(null));

        // Always allowed regardless of field type
        H.condition('amount', H.isNull(true));

        // scope() only accepts object/array paths (not scalars)
        H.scope('customer', Customer => Customer.empty());
        H.scope('lines', Lines => Lines.empty());

        // @ts-expect-error scope cannot target a scalar leaf
        H.scope('customer.email', Customer => Customer.empty());

        // @ts-expect-error scope cannot target a scalar leaf
        H.scope('amount', Amount => Amount.empty());

        // @ts-expect-error invalid path
        H.condition('missing', H.eq('x'));

        // @ts-expect-error invalid nested path
        H.condition('customer.missing', H.eq('x'));

        // @ts-expect-error value type mismatch (amount is number|null)
        H.condition('amount', H.eq('x'));

        // @ts-expect-error string-only operator on non-string field
        H.condition('amount', H.ilike('%x%'));

        // Ensure expression is usable as a transform condition
        TransformResult.condition(c1);
        TransformResult.condition(c2);
        TransformResult.condition(c3);
        TransformResult.condition(c4);

        expect(true).toBe(true);
    });

    it('supports scope into array field with AND of inner conditions', () => {
        type NestedExampleRow = Omit<ExampleRow, 'lines'> & {
            lines: Array<{
                item: {
                    sku: string;
                    qty: number | null;
                };
            }>;
        };

        const H = hasuraDSLforRowType(rowType<NestedExampleRow>());

        const scoped = H.scope('lines', Line =>
            Line.and(
                Line.condition('item.sku', Line.ilike('%SKU%')),
                Line.condition('item.qty', Line.gt(1))
            )
        );

        // @ts-expect-error inner condition must use element-field paths
        H.scope('lines', Line => Line.condition('item.missing', Line.eq('x')));

        TransformResult.condition(scoped);

        expect(true).toBe(true);
    });
});

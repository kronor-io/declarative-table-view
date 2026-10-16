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

    it('offers the jsonb operators on a jsonb field only', () => {
        // A jsonb column, as the row typegen gives it.
        type RowWithJson = ExampleRow & { roles: unknown | null };
        const H = hasuraDSLforRowType(rowType<RowWithJson>());

        H.condition('roles', H.hasKeysAny(['ROLE_ADMIN']));
        H.condition('roles', H.hasKeysAll(['ROLE_ADMIN', 'ROLE_USER']));
        H.condition('roles', H.hasKey('ROLE_ADMIN'));
        H.condition('roles', H.contains({ ROLE_ADMIN: true }));
        H.condition('roles', H.containedIn({ ROLE_ADMIN: true }));

        // @ts-expect-error a string column has no jsonb operators
        H.condition('id', H.hasKey('x'));

        // @ts-expect-error a number column has no jsonb operators
        H.condition('amount', H.contains({}));

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

    // Relationships that lead back to their own type, as in a generated schema
    // (an account's parent account, a business unit's parent unit). With paths
    // up to 11 segments a single condition on this row took more instantiations
    // than TypeScript allows (TS2589), whichever path it named.
    type Account = {
        id: string;
        name: string | null;
        number: string | null;
        description: string | null;
        createdAt: string | null;
        modifiedAt: string | null;
        currency: string | null;
        iban: string | null;
        parent: Account | null;
        unit: Unit | null;
    };
    type Unit = {
        id: string;
        name: string | null;
        code: string | null;
        description: string | null;
        createdAt: string | null;
        modifiedAt: string | null;
        externalReference: string | null;
        deletedAt: string | null;
        parent: Unit | null;
        owner: Owner | null;
    };
    type Owner = {
        id: string;
        email: string | null;
        name: string | null;
        role: string | null;
        createdAt: string | null;
        modifiedAt: string | null;
        locale: string | null;
        timezone: string | null;
        account: Account | null;
        unit: Unit | null;
    };

    it('typechecks a condition on a row whose relationships lead back to their own type', () => {
        const H = hasuraDSLforRowType(rowType<Account>());

        H.condition('id', H.eq('1'));
        H.condition('parent.unit.owner.email', H.ilike('%@boozt%'));
        // Six segments is the deepest path a condition takes
        H.condition('parent.parent.parent.parent.parent.name', H.eq('x'));

        // @ts-expect-error seven segments is beyond what a condition takes
        H.condition('parent.parent.parent.parent.parent.parent.name', H.eq('x'));

        // A deeper path goes through scope
        H.scope('parent.parent.parent', Ancestor =>
            Ancestor.condition('parent.parent.parent.name', Ancestor.eq('x')));

        expect(true).toBe(true);
    });
});

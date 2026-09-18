import { describe, it, expect } from '@jest/globals';
import { rowType } from './columns';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filterExprForRowType } from './filterExprForRow';
import { filter } from './filters';
import { hasuraDSLforRowType } from './hasura';
import { TransformResult } from '../framework/filters';

// The row-scoped builder reports each problem on the property that caused it,
// which is what these @ts-expect-error directives pin down: they sit on the
// `field:` or `control:` line rather than on the enclosing call.

type ExampleRow = {
    id: string;
    amount: number | null;
    live: boolean;
    createdAt: string;
    status: 'pending' | 'paid';
    customer?: {
        email: string | null;
        age: number | null;
    } | null;
};

const Row = rowType<ExampleRow>();
const F = filterExprForRowType(Row);
const H = hasuraDSLforRowType(Row);

describe('dsl/filterExprForRow', () => {
    it('builds the same values as FilterExpr', () => {
        expect(F.equals({ field: 'id', control: FilterControl.text() }))
            .toEqual(FilterExpr.equals({ field: 'id', control: FilterControl.text() }));

        expect(F.range({ field: 'amount', control: FilterControl.number }))
            .toEqual(FilterExpr.range({ field: 'amount', control: FilterControl.number }));

        expect(F.field.or('id', 'customer.email')).toEqual({ or: ['id', 'customer.email'] });
        expect(F.allOperators).toBe(FilterExpr.allOperators);
    });

    it('accepts leaves that suit the row', () => {
        F.equals({ field: 'id', control: FilterControl.text() });
        F.iLike({ field: 'customer.email', control: FilterControl.text() });
        F.greaterThan({ field: 'amount', control: FilterControl.number() });
        F.range({ field: 'createdAt', control: FilterControl.date });
        F.in({ field: 'status', control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] }) });
        F.like({ field: F.field.or('id', 'customer.email'), control: FilterControl.text() });
    });

    it('reports an unsupported operator on the field', () => {
        F.iLike({
            // @ts-expect-error iLike is not available on a numeric column
            field: 'amount',
            control: FilterControl.number()
        });

        F.greaterThan({
            // @ts-expect-error greaterThan is not available on a boolean column
            field: 'live',
            control: FilterControl.dropdown({ items: [{ label: 'Yes', value: true }] })
        });
    });

    it('reports an unusable control on the control', () => {
        F.equals({
            field: 'amount',
            // @ts-expect-error a text control cannot filter a numeric column
            control: FilterControl.text()
        });

        F.equals({
            field: 'status',
            // @ts-expect-error 'bogus' is not one of the values status can hold
            control: FilterControl.dropdown({ items: [{ label: 'Oops', value: 'bogus' }] })
        });

        F.equals({
            field: 'status',
            // @ts-expect-error a multiselect yields a list; equals would compare a scalar to it
            control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] })
        });
    });

    it('reports an unknown field on the field', () => {
        F.equals({
            // @ts-expect-error field must exist on ExampleRow
            field: 'doesNotExist',
            control: FilterControl.text()
        });

        F.equals({
            // @ts-expect-error nested field must exist on ExampleRow
            field: 'customer.doesNotExist',
            control: FilterControl.text()
        });

        // @ts-expect-error a field group only takes the row's own paths
        F.field.or('id', 'doesNotExist');
    });

    it('leaves a leaf that carries a transform to its transform', () => {
        // A transform is a second argument, and the control/operator checks
        // stand down: a text control may feed a numeric column through it.
        F.iLike(
            { field: 'amount', control: FilterControl.text() },
            { toQuery: input => TransformResult.value(Number(input)) }
        );

        // The customOperator list still has to hold operators the column has.
        F.equals(
            {
                field: 'amount',
                // @ts-expect-error _ilike is not available on a numeric column
                control: FilterControl.customOperator({
                    operators: [{ label: 'ilike', value: '_ilike' }],
                    valueControl: FilterControl.number()
                })
            },
            { toQuery: () => TransformResult.condition(H.condition('amount', H.gt(1))) }
        );

        F.equals(
            {
                // @ts-expect-error a transform does not excuse an unknown field
                field: 'nope',
                control: FilterControl.text()
            },
            { toQuery: input => TransformResult.value(input) }
        );
    });

    it('types a transform input from the control it is paired with', () => {
        F.greaterThan(
            { field: 'createdAt', control: FilterControl.date() },
            { toQuery: input => TransformResult.value(input.toISOString()) }
        );

        F.in(
            { field: 'status', control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] }) },
            { toQuery: input => TransformResult.value(input.map(value => value.toUpperCase())) }
        );

        F.iLike(
            { field: 'amount', control: FilterControl.text() },
            // @ts-expect-error a text control produces a string, not a number
            { toQuery: (input: number) => TransformResult.value(input) }
        );

        F.greaterThan(
            { field: 'createdAt', control: FilterControl.date() },
            // @ts-expect-error a date control produces a Date, which has no toUpperCase
            { toQuery: input => TransformResult.value(input.toUpperCase()) }
        );
    });

    it('composes into trees and into filter()', () => {
        filter({
            rowType: Row,
            id: 'composed',
            label: 'Composed',
            expression: F.and({
                filters: [
                    F.equals({ field: 'id', control: FilterControl.text() }),
                    F.not({ filter: F.greaterThan({ field: 'amount', control: FilterControl.number() }) }),
                    F.range({ field: 'createdAt', control: FilterControl.date }),
                    F.computedCondition({
                        control: FilterControl.text(),
                        transform: { toQuery: (input: unknown) => TransformResult.condition(H.condition('id', H.eq(String(input)))) }
                    })
                ]
            })
        });

        // A leaf nested in a tree keeps being checked: the contextual type must
        // not make it look transformed.
        filter({
            rowType: Row,
            id: 'nested-bad',
            label: 'Bad',
            // @ts-expect-error the nested leaf filters a numeric column with a text control
            expression: FilterExpr.and({
                filters: [FilterExpr.equals({ field: 'amount', control: FilterControl.text() })]
            })
        });
    });
});

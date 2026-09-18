import { describe, it } from '@jest/globals';
import * as DSL from './index';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filterExprForRowType } from './filterExprForRow';
import { hasuraDSLforRowType } from './hasura';
import { rowType, valueQuery } from './columns';
import { TransformResult } from '../framework/filters';

// The examples in docs/api/row-typed-views.md, kept compiling so that the
// documentation cannot drift away from the API it describes.

type PaymentRequestsRow = {
    amount: number;
    createdAt: string;
    status: 'paid' | 'pending';
    reference: string;
    customer: { email: string };
    lines: Array<{ item: { sku: string } }>;
};
const PaymentRequestsRowType = rowType<PaymentRequestsRow>();

describe('docs/api/row-typed-views.md examples', () => {
    it('column', () => {
        DSL.column({
            rowType: PaymentRequestsRowType,
            id: 'amount',
            name: 'Amount',
            data: [valueQuery({ field: 'amount' })],
            orderBy: 'amount',
            cellRenderer: ({ data }) => data.amount
        });
    });

    it('filter', () => {
        DSL.filter({
            rowType: PaymentRequestsRowType,
            id: 'status',
            label: 'Status',
            expression: FilterExpr.equals({
                field: 'status',
                control: FilterControl.dropdown({
                    items: [{ label: 'Paid', value: 'paid' }, { label: 'Pending', value: 'pending' }]
                })
            })
        });
    });

    it('row-scoped builders', () => {
        const F = filterExprForRowType(PaymentRequestsRowType);
        F.iLike({ field: 'customer.email', control: FilterControl.text() });
        F.in({ field: 'status', control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] }) });
        F.like({ field: F.field.or('reference', 'customer.email'), control: FilterControl.text() });

        const H = hasuraDSLforRowType(PaymentRequestsRowType);
        H.condition('amount', H.gt(1000));
        H.scope('lines', Line => Line.condition('item.sku', Line.ilike('%SKU%')));
    });

    it('transforms', () => {
        FilterExpr.equals({
            field: 'amount',
            control: FilterControl.number(),
            transform: { toQuery: input => TransformResult.value(input === null ? null : input * 100) }
        });

        const F = filterExprForRowType(PaymentRequestsRowType);
        F.iLike(
            { field: 'amount', control: FilterControl.text() },
            { toQuery: input => TransformResult.value(Number(input)) }
        );

        const H = hasuraDSLforRowType(PaymentRequestsRowType);
        F.greaterThan(
            { field: 'amount', control: FilterControl.number() },
            { toQuery: (input, context) => TransformResult.condition(H.condition(context.field, H.gt(Number(input)))) }
        );

        F.equals(
            { field: 'reference', control: FilterControl.text() },
            { toQuery: (input, context) => context.result.fieldValue('customer.email', input) }
        );

        const operators = [{ label: 'equals', value: '_eq' }];
        DSL.filter({
            rowType: PaymentRequestsRowType,
            id: 'amount-operator',
            label: 'Amount',
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({ operators, valueControl: FilterControl.number() }),
                transform: { toQuery: (input, context) => context.transform.hasuraCustomOperator.toQuery(input, context) }
            })
        });
    });

    it('a filter whose transform owns the query', () => {
        FilterExpr.in({
            field: 'status',
            fieldLabel: 'Status',
            control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] }),
            transform: { toQuery: input => TransformResult.value(input) }
        });

        FilterControl.dropdown({
            items: [{ label: 'Paid', value: 'paid' }, { label: 'Pending', value: 'pending' }],
            initialValue: 'paid'
        });
    });

    it('reusable helper', () => {
        function textFilter<Row, const Field extends DSL.FilterFieldPath<Row>>(
            args: { rowType: Row; id: string; label: string; field: Field }
        ) {
            return DSL.filter({
                rowType: args.rowType,
                id: args.id,
                label: args.label,
                expression: FilterExpr.equals({ field: args.field, control: FilterControl.text() })
            });
        }
        textFilter({ rowType: PaymentRequestsRowType, id: 'reference', label: 'Reference', field: 'reference' });

        function numberRangeFilter<Row, const Field extends DSL.FilterFieldPath<Row>>(args: {
            rowType: Row; id: string; label: string; field: Field & DSL.ValidateFilterFieldType<Row, Field, number>;
        }) {
            return DSL.filter({
                rowType: args.rowType,
                id: args.id,
                label: args.label,
                expression: FilterExpr.range({ field: args.field, control: FilterControl.number })
            });
        }

        numberRangeFilter({ rowType: PaymentRequestsRowType, id: 'amount', label: 'Amount', field: 'amount' });
        numberRangeFilter({
            rowType: PaymentRequestsRowType,
            id: 'when',
            label: 'When',
            // @ts-expect-error createdAt is not a numeric column
            field: 'createdAt'
        });
    });
});

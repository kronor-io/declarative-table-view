import { describe, it } from '@jest/globals';
import { rowType } from './columns';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filter, filterField } from './filters';
import { hasuraDSLforRowType } from './hasura';
import { TransformResult } from '../framework/filters';

// Type-level regression tests: a leaf's control and operator have to suit the
// type of the field it filters. Nothing is asserted at runtime; the test fails
// if TypeScript disagrees with the expectations expressed here.

type ExampleRow = {
    id: string;
    amount: number | null;
    live: boolean;
    // Hasura date/timestamp scalars are generated as `string`.
    createdAt: string;
    status: 'pending' | 'paid';
    tags: string[];
    // json/jsonb columns are generated as `any`.
    payload: any;
    customer?: {
        email: string | null;
        age: number | null;
    } | null;
};

const Row = rowType<ExampleRow>();

describe('dsl/filters control and operator typing', () => {
    it('accepts controls that can produce the field type', () => {
        filter({
            rowType: Row,
            id: 'id',
            label: 'ID',
            expression: FilterExpr.equals({ field: 'id', control: FilterControl.text() })
        });

        filter({
            rowType: Row,
            id: 'amount',
            label: 'Amount',
            expression: FilterExpr.greaterThan({ field: 'amount', control: FilterControl.number() })
        });

        filter({
            rowType: Row,
            id: 'created-at',
            label: 'Created At',
            expression: FilterExpr.range({ field: 'createdAt', control: FilterControl.date })
        });

        filter({
            rowType: Row,
            id: 'nested',
            label: 'Customer Age',
            expression: FilterExpr.lessThanOrEqual({ field: 'customer.age', control: FilterControl.number() })
        });

        // jsonb columns are typed `any` and take any control
        filter({
            rowType: Row,
            id: 'payload',
            label: 'Payload',
            expression: FilterExpr.equals({ field: 'payload', control: FilterControl.text() })
        });

        // a custom component's value is its own business
        filter({
            rowType: Row,
            id: 'custom',
            label: 'Custom',
            expression: FilterExpr.equals({ field: 'amount', control: FilterControl.custom(() => null) })
        });
    });

    it('rejects controls that cannot produce the field type', () => {
        filter({
            rowType: Row,
            id: 'text-on-number',
            label: 'Bad',
            // @ts-expect-error a text control cannot filter a numeric column
            expression: FilterExpr.equals({ field: 'amount', control: FilterControl.text() })
        });

        filter({
            rowType: Row,
            id: 'number-on-text',
            label: 'Bad',
            // @ts-expect-error a number control cannot filter a string column
            expression: FilterExpr.equals({ field: 'id', control: FilterControl.number() })
        });

        filter({
            rowType: Row,
            id: 'date-on-boolean',
            label: 'Bad',
            // @ts-expect-error a date control cannot filter a boolean column
            expression: FilterExpr.equals({ field: 'live', control: FilterControl.date() })
        });

        filter({
            rowType: Row,
            id: 'text-on-nested-number',
            label: 'Bad',
            // @ts-expect-error nested fields are checked the same way
            expression: FilterExpr.equals({ field: 'customer.age', control: FilterControl.text() })
        });

        filter({
            rowType: Row,
            id: 'text-on-multi-field',
            label: 'Bad',
            // @ts-expect-error every field of an or() group has to accept the control
            expression: FilterExpr.iLike({ field: filterField.or('id', 'amount'), control: FilterControl.text() })
        });
    });

    it('checks inline dropdown and multiselect item values', () => {
        filter({
            rowType: Row,
            id: 'status',
            label: 'Status',
            expression: FilterExpr.equals({
                field: 'status',
                control: FilterControl.dropdown({ items: [{ label: 'Pending', value: 'pending' }, { label: 'Paid', value: 'paid' }] })
            })
        });

        filter({
            rowType: Row,
            id: 'statuses',
            label: 'Statuses',
            expression: FilterExpr.in({
                field: 'status',
                control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] })
            })
        });

        filter({
            rowType: Row,
            id: 'live',
            label: 'Live',
            expression: FilterExpr.equals({
                field: 'live',
                control: FilterControl.dropdown({ items: [{ label: 'Yes', value: true }, { label: 'No', value: false }] })
            })
        });

        filter({
            rowType: Row,
            id: 'bad-item',
            label: 'Bad',
            // @ts-expect-error 'bogus' is not one of the values status can hold
            expression: FilterExpr.equals({
                field: 'status',
                control: FilterControl.dropdown({ items: [{ label: 'Paid', value: 'paid' }, { label: 'Oops', value: 'bogus' }] })
            })
        });

        filter({
            rowType: Row,
            id: 'bad-item-type',
            label: 'Bad',
            // @ts-expect-error a numeric column cannot hold '10'
            expression: FilterExpr.in({
                field: 'amount',
                control: FilterControl.multiselect({ items: [{ label: 'Ten', value: '10' }] })
            })
        });

        // Items built at runtime are widened and cannot be inspected.
        const items = ['pending', 'paid'].map(value => ({ label: value, value }));
        filter({
            rowType: Row,
            id: 'runtime-items',
            label: 'Status',
            expression: FilterExpr.equals({ field: 'status', control: FilterControl.dropdown({ items }) })
        });
    });

    it('restricts operators to the ones Hasura offers for the field type', () => {
        filter({
            rowType: Row,
            id: 'ilike-on-text',
            label: 'Email',
            expression: FilterExpr.iLike({ field: 'customer.email', control: FilterControl.text() })
        });

        filter({
            rowType: Row,
            id: 'gt-on-date-string',
            label: 'Created After',
            expression: FilterExpr.greaterThan({ field: 'createdAt', control: FilterControl.date() })
        });

        filter({
            rowType: Row,
            id: 'isnull-on-boolean',
            label: 'Live Is Null',
            expression: FilterExpr.isNull({ field: 'live', control: FilterControl.dropdown({ items: [{ label: 'Yes', value: true }] }) })
        });

        filter({
            rowType: Row,
            id: 'ilike-on-number',
            label: 'Bad',
            // @ts-expect-error iLike is not available on a numeric column
            expression: FilterExpr.iLike({ field: 'amount', control: FilterControl.number() })
        });

        filter({
            rowType: Row,
            id: 'gt-on-boolean',
            label: 'Bad',
            // @ts-expect-error greaterThan is not available on a boolean column
            expression: FilterExpr.greaterThan({ field: 'live', control: FilterControl.dropdown({ items: [{ label: 'Yes', value: true }] }) })
        });

        filter({
            rowType: Row,
            id: 'like-on-nested-number',
            label: 'Bad',
            // @ts-expect-error like is not available on a numeric column
            expression: FilterExpr.like({ field: 'customer.age', control: FilterControl.text() })
        });
    });

    it('requires in/notIn for a multiselect over a scalar field', () => {
        // A list column can be compared to a list.
        filter({
            rowType: Row,
            id: 'tags',
            label: 'Tags',
            expression: FilterExpr.equals({
                field: 'tags',
                control: FilterControl.multiselect({ items: [{ label: 'New', value: 'new' }] })
            })
        });

        filter({
            rowType: Row,
            id: 'multiselect-equals',
            label: 'Bad',
            // @ts-expect-error a multiselect yields a list; equals would compare a scalar to it
            expression: FilterExpr.equals({
                field: 'status',
                control: FilterControl.multiselect({ items: [{ label: 'Paid', value: 'paid' }] })
            })
        });
    });

    it('checks inline customOperator operator lists', () => {
        const H = hasuraDSLforRowType(Row);
        const passthrough = {
            toQuery: (input: unknown) => TransformResult.condition(H.condition('id', H.eq(String(input))))
        };

        filter({
            rowType: Row,
            id: 'amount-operators',
            label: 'Amount',
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({
                    operators: [{ label: 'equals', value: '_eq' }, { label: 'greater than', value: '_gt' }],
                    valueControl: FilterControl.number()
                }),
                transform: passthrough
            })
        });

        // Operators that are not Hasura's are left to the transform.
        filter({
            rowType: Row,
            id: 'custom-operator-name',
            label: 'Amount',
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({
                    operators: [{ label: 'between', value: 'between' }],
                    valueControl: FilterControl.number()
                }),
                transform: passthrough
            })
        });

        // As is a list the view assembles at runtime, FilterExpr.allOperators included.
        filter({
            rowType: Row,
            id: 'all-operators',
            label: 'Amount',
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({
                    operators: FilterExpr.allOperators,
                    valueControl: FilterControl.number()
                }),
                transform: passthrough
            })
        });

        filter({
            rowType: Row,
            id: 'bad-operator',
            label: 'Bad',
            // @ts-expect-error _ilike is not available on a numeric column
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({
                    operators: [{ label: 'equals', value: '_eq' }, { label: 'ilike', value: '_ilike' }],
                    valueControl: FilterControl.number()
                }),
                transform: passthrough
            })
        });
    });

    it('leaves a leaf that carries a transform to its transform', () => {
        // A transform may re-map the value, the field or the whole condition,
        // so the declared control and operator are no longer authoritative.
        filter({
            rowType: Row,
            id: 'transformed',
            label: 'Amount',
            expression: FilterExpr.iLike({
                field: 'amount',
                control: FilterControl.text(),
                transform: { toQuery: (input: unknown) => TransformResult.value(Number(input)) }
            })
        });

        // ... but the field still has to exist.
        filter({
            rowType: Row,
            id: 'transformed-bad-field',
            label: 'Bad',
            // @ts-expect-error a transform does not excuse an unknown field
            expression: FilterExpr.equals({
                field: 'nope',
                control: FilterControl.text(),
                transform: { toQuery: (input: unknown) => TransformResult.value(input) }
            })
        });
    });

    it('checks the leaves of and/or/not trees', () => {
        filter({
            rowType: Row,
            id: 'tree',
            label: 'Tree',
            expression: FilterExpr.and({
                filters: [
                    FilterExpr.equals({ field: 'id', control: FilterControl.text() }),
                    FilterExpr.not({
                        filter: FilterExpr.or({
                            filters: [
                                FilterExpr.greaterThan({ field: 'amount', control: FilterControl.number() }),
                                FilterExpr.iLike({ field: 'customer.email', control: FilterControl.text() })
                            ]
                        })
                    })
                ]
            })
        });

        filter({
            rowType: Row,
            id: 'bad-tree',
            label: 'Bad',
            // @ts-expect-error the nested leaf filters a numeric column with a text control
            expression: FilterExpr.and({
                filters: [
                    FilterExpr.equals({ field: 'id', control: FilterControl.text() }),
                    FilterExpr.not({
                        filter: FilterExpr.equals({ field: 'amount', control: FilterControl.text() })
                    })
                ]
            })
        });
    });

    it('leaves computedCondition to its transform', () => {
        const H = hasuraDSLforRowType(Row);

        filter({
            rowType: Row,
            id: 'computed',
            label: 'Computed',
            expression: FilterExpr.computedCondition({
                control: FilterControl.text(),
                transform: {
                    toQuery: (input: unknown) => TransformResult.condition(H.condition('id', H.eq(String(input))))
                }
            })
        });
    });
});

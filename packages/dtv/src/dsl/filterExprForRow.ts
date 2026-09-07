/**
 * A row-scoped view of `FilterExpr`.
 *
 * The helpers on `FilterExpr` accept any field name and are checked once the
 * expression reaches `filter({ rowType })`, which reports every problem on the
 * `filter()` call. Scoping the builder to a row instead — the same shape as
 * `hasuraDSLforRowType` and `queryForRowType` — gives the editor a row to work
 * from:
 *
 *     const F = filterExprForRowType(rowType<PaymentRow>());
 *
 *     F.iLike({ field: 'customer.email', control: FilterControl.text() })
 *
 * Field names complete as they are typed, and each problem is reported on the
 * property that caused it: an operator the column does not support on `field`,
 * a control that cannot produce its type on `control`.
 *
 * The results are ordinary `FilterExpr` values, so `filter({ rowType })` still
 * checks them; the row-scoped builder is about where errors appear, not about
 * checking more.
 */
import type { FieldPath } from '@kronor/hasura-graphql';
import type { FilterControl, FilterTransform } from '../framework/filters';
import type { FilterField } from '../framework/filters';
import {
    FilterExpr,
    type FilterExprLeaf,
    type FilterExprLeafWithTransform,
    type FilterRangeFor
} from './filterExpr';
import type { ControlValue } from './filterControl';
import type { FilterFieldForRow } from './filters';
import type {
    FilterLeafOperator,
    MutableTuple,
    ValidateControlForRow,
    ValidateOperatorForRow,
    ValidateOperatorListForRow
} from './filterTyping';

/**
 * The checks for one leaf, each attached to the property it is about — an
 * operator the column does not offer belongs on `field`, a control that cannot
 * produce its type on `control`.
 *
 * A transform is passed as a second argument rather than as a third property,
 * for two reasons. It decides the value that reaches the query, so it stands
 * the pair of checks down — and a check that depended on a type parameter
 * inferred from a *sibling property* would fix `Field` and `Control` to their
 * constraints, costing both the per-property errors and the typed `input`.
 * Separate arguments keep the two apart, and the arity tells the overloads
 * apart cleanly.
 */
/**
 * When the field itself is not one of the row's paths, inference for `Field`
 * falls back to its constraint — the whole union — and a check computed over
 * that reports against every path of the row. The field's own error says
 * everything needed, so the rest stands down.
 */
type WhenFieldKnown<Row, Field, Check> = FilterFieldForRow<Row> extends Field ? unknown : Check;

type LeafBuilderForRow<Row, Type extends FilterLeafOperator> = {
    <const Field extends FilterFieldForRow<Row>, const Control extends FilterControl>(
        args: {
            field: Field & WhenFieldKnown<Row, Field, ValidateOperatorForRow<Row, Type, Field>>;
            control: Control & WhenFieldKnown<Row, Field, ValidateControlForRow<Row, Type, Field, Control>>;
            fieldLabel?: string;
        }
    ): FilterExprLeaf<Type, Field & FilterField, Control>;
    <
        const Field extends FilterFieldForRow<Row>,
        const Control extends FilterControl,
        const Transform extends FilterTransform<ControlValue<Control>, Row, Field>
    >(
        args: {
            field: Field;
            // The operator list reaches Hasura through the transform verbatim,
            // so it is checked either way.
            control: Control & WhenFieldKnown<Row, Field, ValidateOperatorListForRow<Row, Field, Control>>;
            fieldLabel?: string;
        },
        transform: Transform
    ): FilterExprLeafWithTransform<Type, Field & FilterField, Control, Transform>;
};

// Both bounds are comparisons, so one operator stands for the pair.
type RangeBuilderForRow<Row> = {
    <const Field extends FilterFieldForRow<Row>, const Control extends FilterControl>(
        args: {
            field: Field & WhenFieldKnown<Row, Field, ValidateOperatorForRow<Row, 'greaterThanOrEqual', Field>>;
            control: (options: { placeholder: string }) => Control & WhenFieldKnown<Row, Field, ValidateControlForRow<Row, 'greaterThanOrEqual', Field, Control>>;
            fieldLabel?: string;
        }
    ): FilterRangeFor<Field & FilterField, Control, never>;
    <
        const Field extends FilterFieldForRow<Row>,
        const Control extends FilterControl,
        const Transform extends FilterTransform<ControlValue<Control>, Row, Field>
    >(
        args: {
            field: Field;
            control: (options: { placeholder: string }) => Control;
            fieldLabel?: string;
        },
        transform: Transform
    ): FilterRangeFor<Field & FilterField, Control, Transform>;
};

export type FilterExprBuilderForRow<Row> = {
    equals: LeafBuilderForRow<Row, 'equals'>;
    notEquals: LeafBuilderForRow<Row, 'notEquals'>;
    greaterThan: LeafBuilderForRow<Row, 'greaterThan'>;
    lessThan: LeafBuilderForRow<Row, 'lessThan'>;
    greaterThanOrEqual: LeafBuilderForRow<Row, 'greaterThanOrEqual'>;
    lessThanOrEqual: LeafBuilderForRow<Row, 'lessThanOrEqual'>;
    in: LeafBuilderForRow<Row, 'in'>;
    notIn: LeafBuilderForRow<Row, 'notIn'>;
    like: LeafBuilderForRow<Row, 'like'>;
    iLike: LeafBuilderForRow<Row, 'iLike'>;
    isNull: LeafBuilderForRow<Row, 'isNull'>;
    range: RangeBuilderForRow<Row>;

    /** Field groups that apply one control to several of the row's fields. */
    field: {
        and: <const Fields extends readonly FieldPath<Row>[]>(...fields: Fields) => { and: MutableTuple<Fields> };
        or: <const Fields extends readonly FieldPath<Row>[]>(...fields: Fields) => { or: MutableTuple<Fields> };
    };

    // These carry no field of their own, so they are the shared helpers.
    and: typeof FilterExpr.and;
    or: typeof FilterExpr.or;
    not: typeof FilterExpr.not;
    computedCondition: typeof FilterExpr.computedCondition;
    allOperators: typeof FilterExpr.allOperators;
};

/**
 * Entry point for the row-scoped filter expression builder. Pass the row type
 * either as an explicit type argument or as a phantom value from `rowType()`.
 */
export function filterExprForRowType<Row>(): FilterExprBuilderForRow<Row>;
export function filterExprForRowType<Row>(_rowType: Row): FilterExprBuilderForRow<Row>;
export function filterExprForRowType<Row>(_rowType?: Row): FilterExprBuilderForRow<Row> {
    void _rowType;

    type UntypedArgs = { field: FilterField; control: FilterControl; fieldLabel?: string };
    type UntypedRangeArgs = { field: FilterField; control: (options: { placeholder: string }) => FilterControl; fieldLabel?: string };

    // Everything behaves as it does on FilterExpr; only the transform moves
    // from a property to an argument.
    const leafFor = (build: (args: UntypedArgs & { transform?: FilterTransform<any> }) => unknown) =>
        (args: UntypedArgs, transform?: FilterTransform<any>) =>
            build(transform ? { ...args, transform } : args);

    return {
        equals: leafFor(FilterExpr.equals),
        notEquals: leafFor(FilterExpr.notEquals),
        greaterThan: leafFor(FilterExpr.greaterThan),
        lessThan: leafFor(FilterExpr.lessThan),
        greaterThanOrEqual: leafFor(FilterExpr.greaterThanOrEqual),
        lessThanOrEqual: leafFor(FilterExpr.lessThanOrEqual),
        in: leafFor(FilterExpr.in),
        notIn: leafFor(FilterExpr.notIn),
        like: leafFor(FilterExpr.like),
        iLike: leafFor(FilterExpr.iLike),
        isNull: leafFor(FilterExpr.isNull),
        range: (args: UntypedRangeArgs, transform?: FilterTransform<any>) =>
            FilterExpr.range(transform ? { ...args, transform } : args),

        field: {
            and: (...fields: string[]) => ({ and: [...fields] }),
            or: (...fields: string[]) => ({ or: [...fields] })
        },

        and: FilterExpr.and,
        or: FilterExpr.or,
        not: FilterExpr.not,
        computedCondition: FilterExpr.computedCondition,
        allOperators: FilterExpr.allOperators
    } as unknown as FilterExprBuilderForRow<Row>;
}

export default filterExprForRowType;

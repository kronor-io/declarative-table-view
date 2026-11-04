import type {
    ConditionOnlyTransform,
    FilterControl,
    FilterExpr as FilterExprType,
    FilterField,
    FilterTransform,
    FilterValueFormatter
} from '../framework/filters';
import { SUPPORTED_OPERATORS } from '../framework/filters';
import type { ControlValue } from './filterControl';
import type { FilterLeafOperator } from './filterTyping';

export type { ConditionOnlyTransform, FilterField, FilterTransform, FilterValueFormatter };
export type FilterExpr = FilterExprType;

/**
 * A leaf built by the helpers below. Field and control are kept as given:
 * `filter({ rowType })` needs them to check the control and the operator
 * against the type of the field being filtered (see ./filterTyping).
 */
export type FilterExprLeaf<
    Type extends FilterLeafOperator,
    Field extends FilterField,
    Control extends FilterControl
> = {
    type: Type;
    field: Field;
    value: Control;
    /** Shown by the applied-filter pill in place of the field path. */
    fieldLabel?: string;
    /** How the applied-filter pill shows the value, in place of the control's own format. */
    formatValue?: FilterValueFormatter<ControlValue<Control>>;
};

/** A leaf whose value passes through a transform on its way to the query. */
export type FilterExprLeafWithTransform<
    Type extends FilterLeafOperator,
    Field extends FilterField,
    Control extends FilterControl,
    Transform extends FilterTransform<any>
> = FilterExprLeaf<Type, Field, Control> & { transform: Transform };

export type FilterRange<Field extends FilterField, Control extends FilterControl> = {
    type: 'and';
    filters: [
        FilterExprLeaf<'greaterThanOrEqual', Field, Control>,
        FilterExprLeaf<'lessThanOrEqual', Field, Control>
    ];
};

export type FilterRangeWithTransform<
    Field extends FilterField,
    Control extends FilterControl,
    Transform extends FilterTransform<any>
> = {
    type: 'and';
    filters: [
        FilterExprLeafWithTransform<'greaterThanOrEqual', Field, Control, Transform>,
        FilterExprLeafWithTransform<'lessThanOrEqual', Field, Control, Transform>
    ];
};

export type LeafArgs<
    Field extends FilterField,
    Control extends FilterControl
> = {
    field: Field;
    control: Control;
    /**
     * What the applied-filter pill shows instead of the field path — for a
     * filter whose transform owns the query, where the path says nothing to
     * whoever is reading the pill.
     */
    fieldLabel?: string;
    /**
     * How the applied-filter pill shows the value, in place of the control's
     * own format — for a value only the filter knows how to read.
     */
    formatValue?: FilterValueFormatter<ControlValue<Control>>;
};

type RangeArgs<
    Field extends FilterField,
    Control extends FilterControl
> = {
    field: Field;
    control: (options: { placeholder: string }) => Control;
    fieldLabel?: string;
    formatValue?: FilterValueFormatter<ControlValue<Control>>;
};

/**
 * The `transform` of the overloads without one: a transform no one can write,
 * rather than `undefined`. A transform with the wrong `input` then fails both
 * overloads at its `toQuery`, so TypeScript reports the error there instead of
 * on the builder's name.
 */
type NoTransform = { toQuery: never };

/**
 * A leaf builder, with or without a transform.
 *
 * Whether a transform was passed decides the leaf's type — a leaf carrying one
 * is exempt from the control and operator checks in ./filterTyping — so each
 * case has an overload of its own. The transform's `input` is typed by its
 * constraint, which is why `Transform` is a type parameter at all; one
 * signature with an optional `transform` would leave `Transform` on that
 * constraint when it is omitted, and an omitted transform would have to be
 * told apart from a passed one by its type. Here it never has to be: without a
 * transform there is no `Transform`.
 */
export type LeafBuilder<Type extends FilterLeafOperator> = {
    <const Field extends FilterField, const Control extends FilterControl>(
        args: LeafArgs<Field, Control> & { transform?: NoTransform }
    ): FilterExprLeaf<Type, Field, Control>;
    <
        const Field extends FilterField,
        const Control extends FilterControl,
        const Transform extends FilterTransform<ControlValue<Control>, unknown, Field>
    >(
        args: LeafArgs<Field, Control> & { transform: Transform }
    ): FilterExprLeafWithTransform<Type, Field, Control, Transform>;
};

/** One implementation for the eleven leaf operators. */
function leaf<Type extends FilterLeafOperator>(type: Type): LeafBuilder<Type> {
    return ((args: LeafArgs<FilterField, FilterControl> & { transform?: FilterTransform<any> }) => ({
        type,
        field: args.field,
        value: args.control,
        ...(args.fieldLabel !== undefined && { fieldLabel: args.fieldLabel }),
        ...(args.formatValue && { formatValue: args.formatValue }),
        ...(args.transform && { transform: args.transform })
    })) as LeafBuilder<Type>;
}

// The same split as LeafBuilder.
function range<const Field extends FilterField, const Control extends FilterControl>(
    args: RangeArgs<Field, Control> & { transform?: NoTransform }
): FilterRange<Field, Control>;
function range<
    const Field extends FilterField,
    const Control extends FilterControl,
    const Transform extends FilterTransform<ControlValue<Control>, unknown, Field>
>(
    args: RangeArgs<Field, Control> & { transform: Transform }
): FilterRangeWithTransform<Field, Control, Transform>;
function range(args: RangeArgs<FilterField, FilterControl> & { transform?: FilterTransform<any> }): FilterExprType {
    const from = args.control({ placeholder: 'from' });
    const to = args.control({ placeholder: 'to' });
    const { field, fieldLabel, formatValue, transform } = args;

    const bounds = transform
        ? [
            FilterExpr.greaterThanOrEqual({ field, control: from, fieldLabel, formatValue, transform }),
            FilterExpr.lessThanOrEqual({ field, control: to, fieldLabel, formatValue, transform })
        ]
        : [
            FilterExpr.greaterThanOrEqual({ field, control: from, fieldLabel, formatValue }),
            FilterExpr.lessThanOrEqual({ field, control: to, fieldLabel, formatValue })
        ];

    return { type: 'and', filters: bounds };
}

// Helper functions for building FilterExpr values
export const FilterExpr = {
    equals: leaf('equals'),
    notEquals: leaf('notEquals'),
    greaterThan: leaf('greaterThan'),
    lessThan: leaf('lessThan'),
    greaterThanOrEqual: leaf('greaterThanOrEqual'),
    lessThanOrEqual: leaf('lessThanOrEqual'),
    in: leaf('in'),
    notIn: leaf('notIn'),
    like: leaf('like'),
    iLike: leaf('iLike'),
    isNull: leaf('isNull'),

    // Condition-only helper for filters that are transformed into a full Hasura condition.
    // Internally uses a leaf expr type, but the operator mapping is bypassed because the transform returns { condition }.
    computedCondition: <const Control extends FilterControl, const Transform extends ConditionOnlyTransform<ControlValue<Control>>>(args: { control: Control; fieldLabel?: string; formatValue?: FilterValueFormatter<ControlValue<Control>>; transform: Transform }): FilterExprLeafWithTransform<'equals', { or: [] }, Control, Transform> =>
        ({
            type: 'equals', // The operator here is a dummy value since the transform will produce the actual condition.
            field: { or: [] },
            value: args.control,
            ...(args.fieldLabel !== undefined && { fieldLabel: args.fieldLabel }),
            ...(args.formatValue && { formatValue: args.formatValue }),
            transform: args.transform
        }),

    and: <const Filters extends readonly FilterExprType[]>(args: { filters: Filters }): {
        type: 'and';
        filters: [...Filters];
    } => ({ type: 'and', filters: args.filters as unknown as [...Filters] }),
    or: <const Filters extends readonly FilterExprType[]>(args: { filters: Filters }): {
        type: 'or';
        filters: [...Filters];
    } => ({ type: 'or', filters: args.filters as unknown as [...Filters] }),
    not: <const Filter extends FilterExprType>(args: { filter: Filter }): {
        type: 'not';
        filter: Filter;
    } => ({ type: 'not', filter: args.filter }),
    range,

    allOperators: SUPPORTED_OPERATORS,
};

export default FilterExpr;

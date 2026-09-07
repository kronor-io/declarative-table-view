import type {
    ConditionOnlyTransform,
    FilterControl,
    FilterExpr as FilterExprType,
    FilterField,
    FilterTransform
} from '../framework/filters';
import { SUPPORTED_OPERATORS } from '../framework/filters';
import type { ControlValue } from './filterControl';
import type { FilterLeafOperator } from './filterTyping';

export type { ConditionOnlyTransform, FilterField, FilterTransform };
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
};

/** A leaf whose value passes through a transform on its way to the query. */
export type FilterExprLeafWithTransform<
    Type extends FilterLeafOperator,
    Field extends FilterField,
    Control extends FilterControl,
    Transform extends FilterTransform<any>
> = FilterExprLeaf<Type, Field, Control> & { transform: Transform };

type IsAny<T> = 0 extends 1 & T ? true : false;
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Whether a transform was actually passed.
 *
 * It cannot be read from the presence of the property, because a transform's
 * `input` is typed by making `Transform` a parameter constrained to
 * `FilterTransform<ControlValue<Control>>` — a parameter's constraint is the
 * only thing that contextually types a callback parameter, and an intersection
 * member is not. So when the property is omitted, `Transform` lands on that
 * constraint rather than on nothing.
 *
 * The constraint is distinguishable, though: its `toQuery` is optional and its
 * input is *exactly* `ControlValue<Control>`. Every real transform differs —
 * an inline object literal has a required `toQuery`, and one annotated
 * `FilterTransform` or `FilterTransform<any>` has a wider input.
 *
 * Getting this wrong in the permissive direction would silently exempt leaves
 * from the checks in ./filterTyping, so filterExpr.transformDetection.test.ts
 * pins down every way a transform can arrive.
 */
export type IsTransformed<Transform, Control> = Transform extends { toQuery?: (input: infer Input, ...rest: never[]) => any }
    ? undefined extends Transform['toQuery']
        ? IsAny<Input> extends true
            ? true
            : Exactly<Input, ControlValue<Control>> extends true ? false : true
        : true
    : true;

export type FilterExprLeafFor<
    Type extends FilterLeafOperator,
    Field extends FilterField,
    Control extends FilterControl,
    Transform
> = IsTransformed<Transform, Control> extends true
    ? FilterExprLeafWithTransform<Type, Field, Control, Extract<Transform, FilterTransform<any>>>
    : FilterExprLeaf<Type, Field, Control>;

export type FilterRangeFor<
    Field extends FilterField,
    Control extends FilterControl,
    Transform
> = {
    type: 'and';
    filters: [
        FilterExprLeafFor<'greaterThanOrEqual', Field, Control, Transform>,
        FilterExprLeafFor<'lessThanOrEqual', Field, Control, Transform>
    ];
};

export type LeafArgs<
    Field extends FilterField,
    Control extends FilterControl,
    Transform extends FilterTransform<any>
> = {
    field: Field;
    control: Control;
    /**
     * What the applied-filter pill shows instead of the field path — for a
     * filter whose transform owns the query, where the path says nothing to
     * whoever is reading the pill.
     */
    fieldLabel?: string;
    transform?: Transform;
};

/** One implementation for the eleven leaf operators. */
function leaf<Type extends FilterLeafOperator>(type: Type) {
    return <
        const Field extends FilterField,
        const Control extends FilterControl,
        const Transform extends FilterTransform<ControlValue<Control>, unknown, Field>
    >(args: LeafArgs<Field, Control, Transform>): FilterExprLeafFor<Type, Field, Control, Transform> => ({
        type,
        field: args.field,
        value: args.control,
        ...(args.fieldLabel !== undefined && { fieldLabel: args.fieldLabel }),
        ...(args.transform && { transform: args.transform })
    }) as FilterExprLeafFor<Type, Field, Control, Transform>;
}

function range<
    const Field extends FilterField,
    const Control extends FilterControl,
    const Transform extends FilterTransform<ControlValue<Control>, unknown, Field>
>(args: {
    field: Field;
    control: (options: { placeholder: string }) => Control;
    fieldLabel?: string;
    transform?: Transform;
}): FilterRangeFor<Field, Control, Transform> {
    const from = args.control({ placeholder: 'from' });
    const to = args.control({ placeholder: 'to' });
    const { field, fieldLabel, transform } = args;

    const bounds = transform
        ? [
            FilterExpr.greaterThanOrEqual({ field, control: from, fieldLabel, transform }),
            FilterExpr.lessThanOrEqual({ field, control: to, fieldLabel, transform })
        ]
        : [
            FilterExpr.greaterThanOrEqual({ field, control: from, fieldLabel }),
            FilterExpr.lessThanOrEqual({ field, control: to, fieldLabel })
        ];

    return { type: 'and', filters: bounds } as unknown as FilterRangeFor<Field, Control, Transform>;
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
    computedCondition: <const Control extends FilterControl, const Transform extends ConditionOnlyTransform<ControlValue<Control>>>(args: { control: Control; fieldLabel?: string; transform: Transform }): FilterExprLeafWithTransform<'equals', { or: [] }, Control, Transform> =>
        ({
            type: 'equals', // The operator here is a dummy value since the transform will produce the actual condition.
            field: { or: [] },
            value: args.control,
            ...(args.fieldLabel !== undefined && { fieldLabel: args.fieldLabel }),
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

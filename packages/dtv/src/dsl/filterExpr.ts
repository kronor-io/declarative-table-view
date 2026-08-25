import type {
    ConditionOnlyTransform,
    FilterControl,
    FilterExpr as FilterExprType,
    FilterField,
    FilterTransform
} from '../framework/filters';
import { SUPPORTED_OPERATORS } from '../framework/filters';

export type { ConditionOnlyTransform, FilterField, FilterTransform };
export type FilterExpr = FilterExprType;

// Helper functions for building FilterExpr values
export const FilterExpr = {
    equals: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'equals';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'equals',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    notEquals: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'notEquals';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'notEquals',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    greaterThan: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'greaterThan';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'greaterThan',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    lessThan: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'lessThan';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'lessThan',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    greaterThanOrEqual: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'greaterThanOrEqual';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'greaterThanOrEqual',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    lessThanOrEqual: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'lessThanOrEqual';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'lessThanOrEqual',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    in: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'in';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'in',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    notIn: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'notIn';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'notIn',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    like: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'like';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'like',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    iLike: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'iLike';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'iLike',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    isNull: <const Field extends FilterField>(args: { field: Field; control: FilterControl; transform?: FilterTransform }): {
        type: 'isNull';
        field: Field;
        value: FilterControl;
        transform?: FilterTransform;
    } =>
        ({
            type: 'isNull',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    // Condition-only helper for filters that are transformed into a full Hasura condition.
    // Internally uses a leaf expr type, but the operator mapping is bypassed because the transform returns { condition }.
    computedCondition: (args: { control: FilterControl; transform: ConditionOnlyTransform }): {
        type: 'equals';
        field: { or: [] };
        value: FilterControl;
        transform: ConditionOnlyTransform;
    } =>
        ({
            type: 'equals', // The operator here is a dummy value since the transform will produce the actual condition.
            field: { or: [] },
            value: args.control,
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
    range: <const Field extends FilterField>(args: { field: Field; control: (options: any) => FilterControl; transform?: FilterTransform }): {
        type: 'and';
        filters: [
            {
                type: 'greaterThanOrEqual';
                field: Field;
                value: FilterControl;
                transform?: FilterTransform;
            },
            {
                type: 'lessThanOrEqual';
                field: Field;
                value: FilterControl;
                transform?: FilterTransform;
            }
        ];
    } =>
        FilterExpr.and({
            filters: [
                FilterExpr.greaterThanOrEqual({ field: args.field, control: args.control({ placeholder: 'from' }), transform: args.transform }),
                FilterExpr.lessThanOrEqual({ field: args.field, control: args.control({ placeholder: 'to' }), transform: args.transform })
            ]
        }),

    allOperators: SUPPORTED_OPERATORS,
};

export default FilterExpr;

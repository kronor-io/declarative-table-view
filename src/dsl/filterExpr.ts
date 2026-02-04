import type { FilterControl, FilterExpr as FilterExprType, FilterField, FilterTransform } from '../framework/filters';
import { SUPPORTED_OPERATORS } from '../framework/filters';

export type { FilterField, FilterTransform };
export type FilterExpr = FilterExprType;

// Helper functions for building FilterExpr values
export const FilterExpr = {
    equals: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'equals',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    notEquals: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'notEquals',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    greaterThan: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'greaterThan',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    lessThan: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'lessThan',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    greaterThanOrEqual: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'greaterThanOrEqual',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    lessThanOrEqual: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'lessThanOrEqual',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    in: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'in',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    notIn: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'notIn',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    like: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'like',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    iLike: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'iLike',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    isNull: (args: { field: FilterField; control: FilterControl; transform?: FilterTransform }): FilterExprType =>
        ({
            type: 'isNull',
            field: args.field,
            value: args.control,
            ...(args.transform && { transform: args.transform })
        }),

    and: (args: { filters: FilterExprType[] }): FilterExprType => ({ type: 'and', filters: args.filters }),
    or: (args: { filters: FilterExprType[] }): FilterExprType => ({ type: 'or', filters: args.filters }),
    not: (args: { filter: FilterExprType }): FilterExprType => ({ type: 'not', filter: args.filter }),
    range: (args: { field: FilterField; control: (options: any) => FilterControl; transform?: FilterTransform }): FilterExprType =>
        FilterExpr.and({
            filters: [
                FilterExpr.greaterThanOrEqual({ field: args.field, control: args.control({ placeholder: 'from' }), transform: args.transform }),
                FilterExpr.lessThanOrEqual({ field: args.field, control: args.control({ placeholder: 'to' }), transform: args.transform })
            ]
        }),

    allOperators: SUPPORTED_OPERATORS,
};

export default FilterExpr;

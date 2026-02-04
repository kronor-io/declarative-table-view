import type {
    FilterExpr,
    FilterField,
    FilterFieldGroup,
    FilterSchema,
    FilterSchemasAndGroups,
    FilterTransform,
} from '../framework/filters';

export type { FilterField, FilterFieldGroup, FilterSchema, FilterSchemasAndGroups, FilterTransform };

export const filterField = {
    and: (...fields: string[]): FilterField => ({ and: fields }),
    or: (...fields: string[]): FilterField => ({ or: fields }),
};

export function group(name: string, label: string | null = null): FilterFieldGroup {
    return {
        name,
        label,
    };
}

export function filter(args: {
    id: string;
    label: string;
    expression: FilterExpr;
    group: string;
}): FilterSchema {
    return {
        id: args.id,
        label: args.label,
        expression: args.expression,
        group: args.group,
        aiGenerated: false,
    };
}

export function filterSchema(groups: FilterFieldGroup[], filters: FilterSchema[]): FilterSchemasAndGroups {
    return {
        groups,
        filters,
    };
}

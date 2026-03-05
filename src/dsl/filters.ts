import type {
    FilterExpr,
    FilterField,
    FilterSchema,
    FilterGroup,
    FilterGroups,
    FilterTransform,
} from '../framework/filters';

export type { FilterField, FilterSchema, FilterGroup, FilterGroups, FilterTransform };

export const filterField = {
    and: (...fields: string[]): FilterField => ({ and: fields }),
    or: (...fields: string[]): FilterField => ({ or: fields }),
};

export function group(name: string, label: string | null = null, filters: FilterSchema[] = []): FilterGroup {
    return {
        name,
        label,
        filters,
    };
}

export function filter(args: {
    id: string;
    label: string;
    expression: FilterExpr;
    aiGenerated?: boolean;
}): FilterSchema {
    return {
        id: args.id,
        label: args.label,
        expression: args.expression,
        aiGenerated: args.aiGenerated ?? false,
    };
}

export function filterGroups(...groups: FilterGroup[]): FilterGroups {
    return groups;
}

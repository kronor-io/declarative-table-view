import { FilterField, FilterSchema, FilterSchemasAndGroups, getFieldNodes } from "./filters";

export type FilterDisplayState =
    | {
        type: 'all';
        expandedGroups: string[];
    }
    | {
        type: 'searchResults';
        schemasAndGroups: FilterSchemasAndGroups;
        expandedGroups: string[];
    };

export function buildFilteredSchemaInGroupOrder(
    filterSchemasAndGroups: FilterSchemasAndGroups,
    filters: FilterSchema[]
): FilterSchemasAndGroups {
    const groupNamesWithFilters = new Set(filters.map(f => f.group));
    return {
        groups: filterSchemasAndGroups.groups.filter(g => groupNamesWithFilters.has(g.name)),
        filters
    };
}

export function createFilterDisplayState(
    filterSchemasAndGroups: FilterSchemasAndGroups,
    rawQuery: string
): FilterDisplayState {
    const query = rawQuery.trim();
    if (!query) {
        return {
            type: 'all',
            expandedGroups: []
        };
    }

    const matches = buildSearchPredicate(query);
    const matchingFilters = filterSchemasAndGroups.filters.filter(matches);
    const schemasAndGroups = buildFilteredSchemaInGroupOrder(filterSchemasAndGroups, matchingFilters);

    return {
        type: 'searchResults',
        schemasAndGroups,
        expandedGroups: schemasAndGroups.groups
            .map(group => group.name)
            .filter(name => name !== 'default')
    };
}

export function buildSearchPredicate(rawQuery: string): (filter: FilterSchema) => boolean {
    const query = rawQuery.trim().toLowerCase();

    function stringMatchesSearchQuery(value: string) {
        return value.toLowerCase().includes(query);
    }

    function fieldMatchesSearchQuery(field: FilterField): boolean {
        if (typeof field === 'string') {
            return stringMatchesSearchQuery(field);
        }
        if ('and' in field) {
            return field.and.some((f: string) => stringMatchesSearchQuery(f));
        }
        if ('or' in field) {
            return field.or.some((f: string) => stringMatchesSearchQuery(f));
        }
        return false;
    }

    return (filter: FilterSchema) => {
        if (!query) return true;
        if (stringMatchesSearchQuery(filter.label)) return true;
        return getFieldNodes(filter.expression).some(expr => fieldMatchesSearchQuery(expr.field));
    };
}

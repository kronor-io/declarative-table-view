import { FilterField, FilterSchema, FilterGroups, getFieldNodes } from "./filters";
import { getAllFilters } from "./view";

export type FilterDisplayState =
    | {
        type: 'all';
        expandedGroups: string[];
    }
    | {
        type: 'searchResults';
        filterGroups: FilterGroups;
        expandedGroups: string[];
    };

export function buildFilteredGroupsInGroupOrder(
    filterGroups: FilterGroups,
    filters: FilterSchema[]
): FilterGroups {
    const filterIdSet = new Set(filters.map(filter => filter.id));
    return filterGroups
        .map(group => ({
            ...group,
            filters: group.filters.filter(filter => filterIdSet.has(filter.id))
        }))
        .filter(group => group.filters.length > 0);
}

export function createFilterDisplayState(
    filterGroups: FilterGroups,
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
    const matchingFilters = getAllFilters(filterGroups).filter(matches);
    const filteredGroups = buildFilteredGroupsInGroupOrder(filterGroups, matchingFilters);

    return {
        type: 'searchResults',
        filterGroups: filteredGroups,
        expandedGroups: filteredGroups
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

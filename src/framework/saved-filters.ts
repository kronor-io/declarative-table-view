import { serializeFilterFormStateMap, parseFilterFormState } from './filter-form-state';
import { FilterSchemasAndGroups } from './filters';
import { FilterState } from './state';

/**
 * Format revisions for saved filters
 */
export const CURRENT_FORMAT_REVISION = '2025-09-19T00:00:00.000Z';

/**
 * Raw saved filter data as stored in localStorage - using unknown for type safety
 */
export interface SavedFilterJson {
    id: string;
    name: string;
    view: string;
    state: unknown; // Serialized FilterState - could be object format or legacy array format
    createdAt: string | Date; // Could be string from JSON or Date object
    formatRevision: string;
}

/**
 * Parsed saved filter with properly typed state
 */
export interface SavedFilter {
    id: string;
    name: string;
    view: string;
    state: FilterState; // Parsed FilterState as a Map
    createdAt: Date;
    formatRevision: string;
}

export type SavedFilterId = SavedFilter['id'];

export const SAVED_FILTERS_KEY = 'dtvSavedFilters';

export function fromSavedFilterJson(rawFilter: SavedFilterJson, schema: FilterSchemasAndGroups): SavedFilter {
    const parsedState = parseFilterFormState(rawFilter.state as Record<string, unknown>, schema);

    return {
        id: rawFilter.id,
        name: rawFilter.name,
        view: rawFilter.view,
        state: parsedState,
        createdAt: typeof rawFilter.createdAt === 'string'
            ? new Date(rawFilter.createdAt)
            : rawFilter.createdAt,
        formatRevision: CURRENT_FORMAT_REVISION
    };
}

export function toSavedFilterJson(savedFilter: SavedFilter): SavedFilterJson {
    return {
        id: savedFilter.id,
        name: savedFilter.name,
        view: savedFilter.view,
        state: serializeFilterFormStateMap(savedFilter.state),
        createdAt: savedFilter.createdAt.toISOString(),
        formatRevision: CURRENT_FORMAT_REVISION
    };
}

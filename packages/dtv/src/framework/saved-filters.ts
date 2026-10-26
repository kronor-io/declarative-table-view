import { decodeFilterState, encodeFilterState } from './filter-form-state';
import { FilterGroups, FilterId } from './filters';
import { FilterState } from './state';
import type { UndecodedSavedFilter } from './user-data-undecoded';

/**
 * Format revisions for saved filters
 */
export const CURRENT_FORMAT_REVISION = '2025-09-19T00:00:00.000Z';

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

export type SavedFilterDecoding = {
    savedFilter: SavedFilter;
    /** Filters whose stored state no longer fit the schema and were reset. */
    resetFilterIds: FilterId[];
};

/** Decodes a saved filter of the view `viewId` against the view's filter schema. */
export function decodeSavedFilter(stored: UndecodedSavedFilter, viewId: string, filterGroups: FilterGroups): SavedFilterDecoding {
    // A saved filter is an exact snapshot: filters it does not mention stay empty.
    const { state, resetFilterIds } = decodeFilterState(stored.state, filterGroups);

    return {
        savedFilter: {
            id: stored.id,
            name: stored.name,
            view: viewId,
            state,
            createdAt: new Date(stored.createdAt),
            formatRevision: CURRENT_FORMAT_REVISION
        },
        resetFilterIds
    };
}

export function encodeSavedFilter(savedFilter: SavedFilter, filterGroups: FilterGroups): UndecodedSavedFilter {
    return {
        id: savedFilter.id,
        name: savedFilter.name,
        view: savedFilter.view,
        state: encodeFilterState(savedFilter.state, filterGroups),
        createdAt: savedFilter.createdAt.toISOString(),
        formatRevision: CURRENT_FORMAT_REVISION
    };
}

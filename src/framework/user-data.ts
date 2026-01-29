import { ViewId } from './view';

import { fromSavedFilterJson, toSavedFilterJson, type SavedFilter, type SavedFilterJson } from './saved-filters';
import { FilterSchemasAndGroups } from './filters';

export const INITIAL_USERDATA_FORMAT_REVISION = '1970-01-01T00:00:00.000Z'

export const REVISION_2026_01_05 = '2026-01-05T00:00:00.000Z'

export const REVISION_2026_01_29 = '2026-01-29T00:00:00.000Z'


export interface ViewData {
    columnOrder: string[] | null;
    hiddenColumns: string[];
    rowsPerPage: number | null;
    savedFilters: SavedFilter[];
}

export interface ViewDataJson {
    columnOrder: string[] | null;
    hiddenColumns: string[];
    rowsPerPage: number | null;
    savedFilters: SavedFilterJson[];
}

export type UserPreferences = {
    /**
     * When set, overrides the App option `syncFilterStateToUrl`.
     * - `true`: always sync filter state to URL
     * - `false`: never sync filter state to URL
     * - `null`: use the App option
     */
    syncFilterStateToUrlOverride: boolean | null;
}

function parseUserPreferences(userPreferencesJson: unknown): UserPreferences {
    const userPreferencesRecord: Record<string, unknown> =
        userPreferencesJson && typeof userPreferencesJson === 'object'
            ? (userPreferencesJson as Record<string, unknown>)
            : defaultUserPreferences

    const syncFilterStateToUrlOverrideRaw: unknown = userPreferencesRecord.syncFilterStateToUrlOverride;
    const syncFilterStateToUrlOverride: boolean | null =
        typeof syncFilterStateToUrlOverrideRaw !== 'boolean'
            ? null
            : syncFilterStateToUrlOverrideRaw;

    return {
        syncFilterStateToUrlOverride
    }
}

export interface UserData {
    preferences: UserPreferences;
    views: Record<ViewId, ViewData>;
    /**
     * Monotonic per-writer revision number, incremented on each persisted change.
     */
    revision: number;
    formatRevision: string;
}

export interface UserDataJson {
    preferences: UserPreferences;
    views: Record<ViewId, ViewDataJson>;
    revision: number;
    formatRevision: string;
}

export const defaultUserPreferences: UserPreferences = {
    syncFilterStateToUrlOverride: null
}

export function defaultUserData(): UserData {
    return {
        preferences: defaultUserPreferences,
        views: {},
        revision: 0,
        formatRevision: INITIAL_USERDATA_FORMAT_REVISION
    }
}

export function defaultViewData(): ViewData {
    return { columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [] }
}

export function toUserDataJson(data: UserData): UserDataJson {
    const viewsJson: Record<ViewId, ViewDataJson> = Object.fromEntries(
        Object.entries(data.views).map(([viewId, view]) => {
            const rawSavedFilters = view.savedFilters.map(toSavedFilterJson);
            return [viewId, { ...view, savedFilters: rawSavedFilters }];
        })
    )

    return {
        preferences: data.preferences,
        views: viewsJson,
        revision: data.revision,
        formatRevision: data.formatRevision
    }
}

export function fromUserDataJson(json: UserDataJson, filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>): UserData {
    // Only hydrate views for which we have filter schemas.
    // Other views may exist in persisted JSON, but are ignored in-memory.
    const views: Record<ViewId, ViewData> = Object.fromEntries(
        Object.entries(json.views).flatMap(([viewId, viewJson]) => {
            const schema = filterSchemasByViewId[viewId]
            if (!schema) return []

            const savedFilters = viewJson.savedFilters.map((savedFilterJson) => fromSavedFilterJson(savedFilterJson, schema))
            return [[viewId, { ...viewJson, savedFilters }]]
        })
    )

    return {
        preferences: parseUserPreferences(json.preferences),
        views,
        revision: json.revision,
        formatRevision: json.formatRevision
    }
}

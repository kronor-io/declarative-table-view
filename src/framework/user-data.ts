import { ViewId } from './view';

import { fromSavedFilterJson, toSavedFilterJson, type SavedFilter, type SavedFilterJson } from './saved-filters';
import { FilterSchemasAndGroups } from './filters';

export const INITIAL_USERDATA_FORMAT_REVISION = '1970-01-01T00:00:00.000Z'

export const REVISION_2026_01_05 = '2026-01-05T00:00:00.000Z'


export interface ViewData {
    columnOrder: string[] | null;
    hiddenColumns: string[];
    savedFilters: SavedFilter[];
}

export interface ViewDataJson {
    columnOrder: string[] | null;
    hiddenColumns: string[];
    savedFilters: SavedFilterJson[];
}

export type UserPreferences = Record<string, unknown>; // Placeholder for future fields

export interface UserData {
    preferences: UserPreferences;
    views: Record<ViewId, ViewData>;
    formatRevision: string;
}

export interface UserDataJson {
    preferences: UserPreferences;
    views: Record<ViewId, ViewDataJson>;
    formatRevision: string;
}

export function defaultUserData(): UserData {
    return { preferences: {}, views: {}, formatRevision: INITIAL_USERDATA_FORMAT_REVISION }
}

export function defaultViewData(): ViewData {
    return { columnOrder: null, hiddenColumns: [], savedFilters: [] }
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
        formatRevision: data.formatRevision
    }
}

export function fromUserDataJson(json: UserDataJson, filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>): UserData {
    const views: Record<ViewId, ViewData> = Object.fromEntries(
        Object.entries(json.views).map(([viewId, viewJson]) => {
            const schema = filterSchemasByViewId[viewId];
            if (!schema) {
                console.warn('Missing filter schema for view while hydrating user data:', viewId);
                return [viewId, { ...viewJson, savedFilters: [] }];
            }

            const savedFilters = viewJson.savedFilters.map(savedFilterJson => fromSavedFilterJson(savedFilterJson, schema));
            return [viewId, { ...viewJson, savedFilters }];
        })
    )

    return {
        preferences: json.preferences,
        views,
        formatRevision: json.formatRevision
    }
}

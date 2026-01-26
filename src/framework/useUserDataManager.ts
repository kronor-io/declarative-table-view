import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FilterSchemasAndGroups } from './filters';
import type { SavedFilter, SavedFilterId } from './saved-filters';
import type { UserPreferences, ViewData } from './user-data';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY, type UserDataManagerOptions } from './user-data-manager';
import type { ViewId } from './view';

export function useUserDataManager(
    filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>,
    currentViewId: ViewId,
    options: UserDataManagerOptions
) {
    const manager = useMemo(() => {
        return createUserDataManager(filterSchemasByViewId, options);
    }, [filterSchemasByViewId, options]);

    // React state for the reactive parts
    const [preferences, setPreferences] = useState<UserPreferences>(() => manager.getPreferences());
    const [viewData, setViewData] = useState<ViewData>(() => manager.getViewData(currentViewId));
    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => manager.getSavedFilters(currentViewId));

    // Sync when view changes
    useEffect(() => {
        setViewData(manager.getViewData(currentViewId));
        setSavedFilters(manager.getSavedFilters(currentViewId));
    }, [currentViewId, manager]);

    // Listen for changes from other tabs
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== USER_DATA_LOCALSTORAGE_KEY) return;
            setPreferences(manager.getPreferences());
            setViewData(manager.getViewData(currentViewId));
            setSavedFilters(manager.getSavedFilters(currentViewId));
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [currentViewId, manager]);

    // If the manager performs async loading, refresh once it completes.
    useEffect(() => {
        let cancelled = false
        manager.ready.then(() => {
            if (cancelled) return
            setPreferences(manager.getPreferences())
            setViewData(manager.getViewData(currentViewId))
            setSavedFilters(manager.getSavedFilters(currentViewId))
        })
        return () => {
            cancelled = true
        }
    }, [currentViewId, manager])

    // Actions that update both state and manager
    const updatePreferences = useCallback(async (updateFunc: (prev: UserPreferences) => UserPreferences) => {
        const prefs = await manager.updatePreferences(updateFunc);
        setPreferences(prefs);
        return prefs;
    }, [manager]);

    const setColumnOrder = useCallback(async (viewId: ViewId, order: string[] | null) => {
        const result = await manager.setColumnOrder(viewId, order);
        if (viewId === currentViewId) {
            setViewData(result);
        }
        return result;
    }, [currentViewId, manager]);

    const setHiddenColumns = useCallback(async (viewId: ViewId, hidden: string[]) => {
        const result = await manager.setHiddenColumns(viewId, hidden);
        if (viewId === currentViewId) {
            setViewData(result)
        }
        return result;
    }, [currentViewId, manager]);

    const setRowsPerPage = useCallback(async (viewId: ViewId, rowsPerPage: number) => {
        const result = await manager.setRowsPerPage(viewId, rowsPerPage);
        if (viewId === currentViewId) {
            setViewData(result)
        }
        return result;
    }, [currentViewId, manager]);

    const createFilter = useCallback(async (filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>) => {
        await manager.createFilter(filter);
        setSavedFilters(manager.getSavedFilters(currentViewId))
    }, [currentViewId, manager]);

    const updateFilter = useCallback(async (viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>) => {
        await manager.updateFilter(viewId, savedFilterId, updates);
        if (viewId === currentViewId) {
            setSavedFilters(manager.getSavedFilters(currentViewId))
        }
    }, [currentViewId, manager]);

    const deleteFilter = useCallback(async (viewId: ViewId, savedFilterId: SavedFilterId) => {
        await manager.deleteFilter(viewId, savedFilterId)
        if (viewId === currentViewId) {
            setSavedFilters(manager.getSavedFilters(currentViewId))
        }
    }, [currentViewId, manager]);

    return {
        preferences,
        viewData,
        savedFilters,
        updatePreferences,
        setRowsPerPage,
        setColumnOrder,
        setHiddenColumns,
        createFilter,
        updateFilter,
        deleteFilter
    };
}

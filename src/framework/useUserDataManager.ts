import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FilterSchemasAndGroups } from './filters';
import type { SavedFilter, SavedFilterId } from './saved-filters';
import type { UserPreferences, ViewData } from './user-data';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY, type UserDataManagerOptions } from './user-data-manager';
import type { ViewId } from './view';

export function useUserDataManager(
    filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>,
    currentViewId: ViewId,
    options?: UserDataManagerOptions
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
    const updatePreferences = useCallback((updateFunc: (prev: UserPreferences) => UserPreferences) => {
        const result = manager.updatePreferences(updateFunc);
        setPreferences(result);
        return result;
    }, [manager]);

    const updateViewData = useCallback((viewId: ViewId, updateFunc: (prev: ViewData) => ViewData) => {
        const result = manager.updateViewData(viewId, updateFunc);
        if (viewId === currentViewId) {
            setViewData(result);
        }
        return result;
    }, [currentViewId, manager]);

    const setColumnOrder = useCallback((viewId: ViewId, order: string[] | null) => {
        const result = manager.setColumnOrder(viewId, order);
        if (viewId === currentViewId) {
            setViewData(result);
        }
        return result;
    }, [currentViewId, manager]);

    const setHiddenColumns = useCallback((viewId: ViewId, hidden: string[]) => {
        const result = manager.setHiddenColumns(viewId, hidden);
        if (viewId === currentViewId) {
            setViewData(result);
        }
        return result;
    }, [currentViewId, manager]);

    const createFilter = useCallback((filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>) => {
        const result = manager.createFilter(filter);
        setSavedFilters(prev => [...prev, result]);
        return result;
    }, [manager]);

    const updateFilter = useCallback((viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>) => {
        const result = manager.updateFilter(viewId, savedFilterId, updates);
        if (result && viewId === currentViewId) {
            setSavedFilters(prev => prev.map(f => f.id === savedFilterId ? result : f));
        }
        return result;
    }, [currentViewId, manager]);

    const deleteFilter = useCallback((viewId: ViewId, savedFilterId: SavedFilterId) => {
        const result = manager.deleteFilter(viewId, savedFilterId);
        if (result && viewId === currentViewId) {
            setSavedFilters(prev => prev.filter(f => f.id !== savedFilterId));
        }
        return result;
    }, [currentViewId, manager]);

    return {
        preferences,
        viewData,
        savedFilters,
        updatePreferences,
        updateViewData,
        setColumnOrder,
        setHiddenColumns,
        createFilter,
        updateFilter,
        deleteFilter
    };
}

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FilterGroups } from './filters';
import type { SavedFilter, SavedFilterId } from './saved-filters';
import type { FilterState } from './state';
import type { UserPreferences } from './user-data';
import { createUserDataManager, type UserDataManager, type UserDataManagerOptions } from './user-data-manager';
import { USER_DATA_LOCALSTORAGE_KEY } from './user-data-storage';
import type { ViewId } from './view';

export function useUserDataManager(
    filterGroupsByViewId: Record<ViewId, FilterGroups>,
    currentViewId: ViewId,
    options: UserDataManagerOptions
) {
    const manager = useMemo(() => {
        return createUserDataManager(filterGroupsByViewId, options);
    }, [filterGroupsByViewId, options]);

    // The manager holds the data. The values below are read from it during render, for the
    // current view, and read again whenever it changed: after a write, after the initial
    // load, and when another tab wrote. Reading during render (rather than syncing state
    // from an effect) keeps `viewData` in step with `currentViewId` within a render.
    const [generation, setGeneration] = useState(0);
    const reread = useCallback(() => setGeneration(previous => previous + 1), []);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- `generation` says the manager's data changed
    const preferences = useMemo(() => manager.getPreferences(), [manager, generation]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    const viewData = useMemo(() => manager.getViewData(currentViewId), [manager, currentViewId, generation]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    const savedFilters = useMemo(() => manager.getSavedFilters(currentViewId), [manager, currentViewId, generation]);

    // The manager whose initial load has completed. Readiness belongs to the manager, not
    // to the view, so switching views does not reset it.
    const [readyManager, setReadyManager] = useState<UserDataManager | null>(null);
    const isReady = readyManager === manager;

    // Adopt what other tabs wrote. The manager caches its data, so it has to re-read
    // localStorage first; the getters alone would hand back the stale cached copy.
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== USER_DATA_LOCALSTORAGE_KEY) return;
            manager.refreshFromLocalStorage();
            reread();
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [manager, reread]);

    // If the manager performs async loading, refresh once it completes.
    useEffect(() => {
        let cancelled = false
        manager.ready.then(() => {
            if (cancelled) return
            setReadyManager(manager)
            reread()
        }).catch((err) => {
            // `ready` is expected to handle its own failures; catch here so an
            // unexpected throw surfaces as a logged error rather than an
            // unhandled rejection.
            console.error('Failed to load user data:', err)
        })
        return () => {
            cancelled = true
        }
    }, [manager, reread])

    // Every write changes the manager's data, so the values above are read again after it.
    const rereadAfter = useCallback(async <T,>(write: Promise<T>): Promise<T> => {
        const result = await write;
        reread();
        return result;
    }, [reread]);

    const updatePreferences = useCallback(
        (updateFunc: (prev: UserPreferences) => UserPreferences) => rereadAfter(manager.updatePreferences(updateFunc)),
        [manager, rereadAfter]
    );

    const setColumnOrder = useCallback(
        (viewId: ViewId, order: string[] | null) => rereadAfter(manager.setColumnOrder(viewId, order)),
        [manager, rereadAfter]
    );

    const setHiddenColumns = useCallback(
        (viewId: ViewId, hidden: string[]) => rereadAfter(manager.setHiddenColumns(viewId, hidden)),
        [manager, rereadAfter]
    );

    const setRowsPerPage = useCallback(
        (viewId: ViewId, rowsPerPage: number) => rereadAfter(manager.setRowsPerPage(viewId, rowsPerPage)),
        [manager, rereadAfter]
    );

    const setSyncFilterStateToUserData = useCallback(
        (viewId: ViewId, enabled: boolean) => rereadAfter(manager.setSyncFilterStateToUserData(viewId, enabled)),
        [manager, rereadAfter]
    );

    const setPersistedFilterState = useCallback(
        (viewId: ViewId, filterState: FilterState | null) => rereadAfter(manager.setPersistedFilterState(viewId, filterState)),
        [manager, rereadAfter]
    );

    const createFilter = useCallback(
        (filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>) => rereadAfter(manager.createFilter(filter)),
        [manager, rereadAfter]
    );

    const updateFilter = useCallback(
        (viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>) =>
            rereadAfter(manager.updateFilter(viewId, savedFilterId, updates)),
        [manager, rereadAfter]
    );

    const deleteFilter = useCallback(
        (viewId: ViewId, savedFilterId: SavedFilterId) => rereadAfter(manager.deleteFilter(viewId, savedFilterId)),
        [manager, rereadAfter]
    );

    return {
        isReady,
        preferences,
        viewData,
        savedFilters,
        updatePreferences,
        setRowsPerPage,
        setColumnOrder,
        setHiddenColumns,
        setSyncFilterStateToUserData,
        setPersistedFilterState,
        createFilter,
        updateFilter,
        deleteFilter
    };
}

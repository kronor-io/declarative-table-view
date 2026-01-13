import { FilterSchemasAndGroups } from "./filters";
import { CURRENT_FORMAT_REVISION, SavedFilter, SavedFilterId } from "./saved-filters";
import { defaultUserData, defaultViewData, fromUserDataJson, toUserDataJson, UserData, UserDataJson, UserPreferences, ViewData } from "./user-data";
import { applyUserDataMigrations } from "./user-data.migrations";
import { ViewId } from "./view";

export interface UserDataManager {
    getPreferences(): UserPreferences
    updatePreferences(update: Partial<UserPreferences> | ((prev: UserPreferences) => UserPreferences)): UserPreferences

    getViewData(viewId: ViewId): ViewData
    updateViewData(viewId: ViewId, update: Partial<ViewData> | ((prev: ViewData) => ViewData)): ViewData
    setColumnOrder(viewId: ViewId, order: string[] | null): ViewData
    setHiddenColumns(viewId: ViewId, hidden: string[] | null): ViewData
    getSavedFilters(viewId: ViewId): SavedFilter[]

    // Saved filter manager API (backed by user data)
    createFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): SavedFilter
    updateFilter(viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): SavedFilter | null
    deleteFilter(viewId: ViewId, savedFilterId: SavedFilterId): boolean
}

export const USER_DATA_LOCALSTORAGE_KEY = 'dtvUserData'

export function createUserDataManager(filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>): UserDataManager {

    let cachedUserData: UserData | null = null

    function loadUserDataWithCache(): UserData {

        function userDataFromStorageOrDefault(): UserData {
            let userDataJsonString: string | null = null
            try {
                userDataJsonString = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)
            } catch (err) {
                console.error('Failed to read localStorage:', err)
                return defaultUserData()
            }

            if (userDataJsonString !== null) {
                try {
                    const parsedUserDataJson = JSON.parse(userDataJsonString) as unknown
                    if (!parsedUserDataJson || typeof parsedUserDataJson !== 'object') return defaultUserData()

                    return fromUserDataJson(parsedUserDataJson as UserDataJson, filterSchemasByViewId)
                } catch (err) {
                    console.error('Failed to parse user data JSON:', err)
                    return defaultUserData()
                }
            }
            return defaultUserData()
        }

        function loadUserData(): UserData {
            try {
                const userDataBeforeMigration = userDataFromStorageOrDefault();
                const beforeStr = JSON.stringify(userDataBeforeMigration);
                const userDataAfterMigration = applyUserDataMigrations(userDataBeforeMigration, { filterSchemasByViewId });

                // If migrations changed content or revision, persist the result
                const afterStr = JSON.stringify(userDataAfterMigration);
                if (beforeStr !== afterStr) {
                    saveUserData(userDataAfterMigration);
                }

                return userDataAfterMigration
            } catch (err) {
                console.error('Failed to read user data:', err);
                return defaultUserData();
            }
        }


        if (cachedUserData) {
            return cachedUserData
        }

        cachedUserData = loadUserData()
        return cachedUserData;
    }

    function saveUserData(nextUserData: UserData): void {
        try {
            // Convert SavedFilter[] to RawSavedFilter[] before persisting
            const userDataJson: UserDataJson = toUserDataJson(nextUserData);
            localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson));
            cachedUserData = nextUserData;
        } catch (err) {
            console.error('Failed saving user data:', err);
        }
    }

    /* API */

    function getPreferences(): UserPreferences {
        return loadUserDataWithCache().preferences
    }

    function updatePreferences(updateFunc: ((prevUserPrefs: UserPreferences) => UserPreferences)): UserPreferences {
        const prevUserData = loadUserDataWithCache()
        const nextUserPrefs = updateFunc(prevUserData.preferences)

        const nextUserData: UserData = { ...prevUserData, preferences: nextUserPrefs }
        saveUserData(nextUserData)
        return nextUserPrefs
    }

    function getViewData(viewId: ViewId): ViewData {
        const userData = loadUserDataWithCache()
        return userData.views[viewId] ?? defaultViewData()
    }

    function updateViewData(viewId: ViewId, updateFunc: ((prevViewData: ViewData) => ViewData)): ViewData {
        const prevUserData = loadUserDataWithCache()
        const prevViewData = prevUserData.views[viewId] ?? defaultViewData()
        const nextViewData = updateFunc(prevViewData)
        const nextUserData: UserData = {
            ...prevUserData,
            views: {
                ...prevUserData.views,
                [viewId]: nextViewData
            }
        }
        saveUserData(nextUserData)
        return nextViewData
    }

    function setColumnOrder(viewId: ViewId, columnOrder: string[] | null): ViewData {
        return updateViewData(viewId, (prevViewData) => ({ ...prevViewData, columnOrder }))
    }

    function setHiddenColumns(viewId: ViewId, columns: string[]): ViewData {
        return updateViewData(viewId, (prevViewData) => ({ ...prevViewData, hiddenColumns: columns }))
    }

    function getSavedFilters(viewId: ViewId): SavedFilter[] {
        const userData = loadUserDataWithCache()
        return userData.views[viewId]?.savedFilters ?? []
    }

    function createFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): SavedFilter {
        const savedFilter: SavedFilter = {
            ...filter,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            formatRevision: CURRENT_FORMAT_REVISION
        }

        const viewId = savedFilter.view as ViewId
        updateViewData(viewId, (prevViewData) => ({
            ...prevViewData,
            savedFilters: [...prevViewData.savedFilters, savedFilter]
        }))

        return savedFilter
    }

    function updateFilter(viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): SavedFilter | null {
        let result: SavedFilter | null = null
        updateViewData(viewId, (prevViewData) => {
            const index = prevViewData.savedFilters.findIndex(existing => existing.id === savedFilterId)
            if (index === -1) {
                result = null
                return prevViewData
            }

            const updatedFilter: SavedFilter = {
                ...prevViewData.savedFilters[index],
                ...updates
            }

            const nextSavedFilters = [...prevViewData.savedFilters]
            nextSavedFilters[index] = updatedFilter
            result = updatedFilter
            return {
                ...prevViewData,
                savedFilters: nextSavedFilters
            }
        })

        return result
    }

    function deleteFilter(viewId: ViewId, savedFilterId: SavedFilterId): boolean {
        const prevViewData = getViewData(viewId)
        const nextSavedFilters = prevViewData.savedFilters.filter(filter => filter.id !== savedFilterId)
        if (nextSavedFilters.length === prevViewData.savedFilters.length) {
            return false
        }

        updateViewData(viewId, (prev) => ({
            ...prev,
            savedFilters: nextSavedFilters
        }))
        return true
    }

    loadUserDataWithCache()

    return {
        getPreferences,
        updatePreferences,
        getViewData,
        updateViewData,
        setColumnOrder,
        setHiddenColumns,
        getSavedFilters,
        createFilter,
        updateFilter,
        deleteFilter
    };
}

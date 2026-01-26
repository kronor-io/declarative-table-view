import { FilterSchemasAndGroups } from './filters';
import { CURRENT_FORMAT_REVISION, SavedFilter, SavedFilterId } from './saved-filters';
import { defaultUserData, defaultViewData, fromUserDataJson, toUserDataJson, UserData, UserDataJson, UserPreferences, ViewData } from './user-data';
import { applyUserDataMigrations, userDataMigrationErrorToMessage } from './user-data.migrations';
import { ViewId } from './view';
import type { ShowToastFn } from './toast'
import { externalLoadFailed, externalSaveFailed, UserDataManagerError, userDataManagerErrorToToast } from './user-data-errors'
import { Result } from './result'

export interface UserDataManager {
    /**
     * Resolves once an optional async load callback has completed (success or failure).
     * Useful for callers that need to await remote/user-provided hydration.
     */
    ready: Promise<void>

    getPreferences(): UserPreferences
    updatePreferences(updateFunc: (prev: UserPreferences) => UserPreferences): Promise<UserPreferences>

    getViewData(viewId: ViewId): ViewData
    setColumnOrder(viewId: ViewId, order: string[] | null): Promise<ViewData>
    setHiddenColumns(viewId: ViewId, hidden: string[] | null): Promise<ViewData>
    setRowsPerPage(viewId: ViewId, rowsPerPage: number): Promise<ViewData>

    getSavedFilters(viewId: ViewId): SavedFilter[]

    // Saved filter manager API (backed by user data)
    createFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): Promise<void>
    updateFilter(viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): Promise<void>
    deleteFilter(viewId: ViewId, savedFilterId: SavedFilterId): Promise<void>
}

export const USER_DATA_LOCALSTORAGE_KEY = 'dtvUserData'

// External callback errors are handled by showing toasts; we do not rethrow.

// Callbacks can optionally receive a toast API to surface feedback
export interface UserDataLoadAPI {
    showToast?: ShowToastFn

    /** Result functions to construct operation results */
    Result: typeof Result
}

export interface UserDataSaveAPI {
    data: UserDataJson
    showToast?: ShowToastFn

    /** Result functions to construct operation results */
    Result: typeof Result
}

export type UserDataLoadCallback = (api: UserDataLoadAPI) => Promise<Result<string, UserDataJson | null>>
export type UserDataSaveCallback = (api: UserDataSaveAPI) => Promise<Result<string, void>>

export type UserDataManagerOptions = {
    load?: UserDataLoadCallback
    save?: UserDataSaveCallback
    /** Toast function forwarded to load/save callbacks */
    showToast: ShowToastFn
}

export function createUserDataManager(
    filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>,
    options: UserDataManagerOptions
): UserDataManager {

    let cachedUserData: UserData | null = null

    async function notifySavedJson(nextUserDataJson: UserDataJson): Promise<Result<string, void>> {
        if (!options.save) return Result.success(undefined)
        return options.save({
            data: nextUserDataJson,
            showToast: options.showToast,
            Result: Result
        })
    }

    function readUserDataJsonFromLocalStorage(): UserDataJson | null {
        let userDataJsonString: string | null = null
        try {
            userDataJsonString = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)
        } catch (err) {
            console.error('Failed to read localStorage:', err)
            return null
        }

        if (userDataJsonString === null) return null

        try {
            const parsed = JSON.parse(userDataJsonString) as unknown
            if (!parsed || typeof parsed !== 'object') return null
            return parsed as UserDataJson
        } catch (err) {
            console.error('Failed to parse user data JSON:', err)
            return null
        }
    }

    function loadUserDataWithCache(): UserData {

        function userDataFromStorageOrDefault(): UserData {
            const existingJson = readUserDataJsonFromLocalStorage()
            if (existingJson) {
                try {
                    return fromUserDataJson(existingJson, filterSchemasByViewId)
                } catch (err) {
                    console.error('Failed to read user data:', err)
                }
            }
            return defaultUserData()
        }

        if (cachedUserData) {
            return cachedUserData
        }

        cachedUserData = userDataFromStorageOrDefault()
        return cachedUserData;
    }

    async function saveUserData(
        nextUserData: UserData,
        saveOptions: {
            localStorageOnly: boolean
            bumpRevision: boolean
        }
    ): Promise<Result<UserDataManagerError, UserDataJson>> {
        const bumpRevision = saveOptions.bumpRevision

        const baseRevision = Math.max(cachedUserData?.revision ?? 0, nextUserData.revision)
        const revision = bumpRevision
            ? baseRevision + 1
            : baseRevision

        const persistedUserData: UserData = bumpRevision
            ? { ...nextUserData, revision }
            : nextUserData

        // Convert the subset of views (with known schemas) to JSON
        const nextUserDataJson: UserDataJson = toUserDataJson(persistedUserData)

        // Merge existing per-view data from local storage to avoid data loss for unknown views
        const existingUserDataJson = readUserDataJsonFromLocalStorage()
        const mergedUserDataJson: UserDataJson = {
            ...nextUserDataJson,
            views: {
                ...(existingUserDataJson?.views ?? {}),
                ...(nextUserDataJson.views ?? {})
            }
        }

        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(mergedUserDataJson))
        cachedUserData = persistedUserData

        if (!saveOptions.localStorageOnly) {
            try {
                const externalSaveResult = await notifySavedJson(mergedUserDataJson)
                return Result.bimap(
                    {
                        mapFailure: externalSaveFailed,
                        mapSuccess: () => mergedUserDataJson
                    },
                    externalSaveResult
                )
            } catch (err) {
                return Result.failure(externalSaveFailed('' + (err instanceof Error ? err.message : err), err))
            }
        }

        return Result.success(mergedUserDataJson)
    }

    /* API */

    function getPreferences(): UserPreferences {
        return loadUserDataWithCache().preferences
    }

    async function updatePreferences(updateFunc: ((prevUserPrefs: UserPreferences) => UserPreferences)): Promise<UserPreferences> {
        const prevUserData = loadUserDataWithCache()
        const nextUserPrefs = updateFunc(prevUserData.preferences)

        const nextUserData: UserData = { ...prevUserData, preferences: nextUserPrefs }
        await saveUserData(nextUserData, { localStorageOnly: false, bumpRevision: true });
        return nextUserPrefs
    }

    function getViewData(viewId: ViewId): ViewData {
        const userData = loadUserDataWithCache()
        return userData.views[viewId] ?? defaultViewData()
    }

    async function updateViewData(viewId: ViewId, updateFunc: ((prevViewData: ViewData) => ViewData)): Promise<Result<UserDataManagerError, ViewData>> {
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
        const saveResult = await saveUserData(nextUserData, { localStorageOnly: false, bumpRevision: true })
        return Result.mapResult(() => nextViewData, saveResult)
    }

    async function setColumnOrder(viewId: ViewId, columnOrder: string[] | null): Promise<ViewData> {
        const result = await updateViewData(viewId, (prevViewData) => ({ ...prevViewData, columnOrder }))
        return Result.isFailure(result) ? getViewData(viewId) : result.value
    }

    async function setHiddenColumns(viewId: ViewId, columns: string[]): Promise<ViewData> {
        const result = await updateViewData(viewId, (prevViewData) => ({ ...prevViewData, hiddenColumns: columns }))
        return Result.isFailure(result) ? getViewData(viewId) : result.value
    }

    async function setRowsPerPage(viewId: ViewId, rowsPerPage: number): Promise<ViewData> {
        const result = await updateViewData(viewId, (prevViewData) => ({ ...prevViewData, rowsPerPage }))
        return Result.isFailure(result) ? getViewData(viewId) : result.value
    }

    function getSavedFilters(viewId: ViewId): SavedFilter[] {
        const userData = loadUserDataWithCache()
        return userData.views[viewId]?.savedFilters ?? []
    }

    async function createFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): Promise<void> {
        const savedFilter: SavedFilter = {
            ...filter,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            formatRevision: CURRENT_FORMAT_REVISION
        }
        const updateResult = await updateViewData(savedFilter.view, (prevViewData) => ({
            ...prevViewData,
            savedFilters: [...prevViewData.savedFilters, savedFilter]
        }))

        Result.match(
            {
                whenError: (error) => {
                    options.showToast({
                        severity: 'error',
                        summary: 'Failed to save filter',
                        detail: `Failed to save filter ${filter.name}": ${userDataManagerErrorToToast(error).detail}`,
                        life: 3000
                    })
                },
                whenSuccess: () => {
                    options.showToast({
                        severity: 'success',
                        summary: 'Filter saved',
                        detail: `Filter "${filter.name}" has been saved successfully`,
                        life: 3000
                    })
                }
            },
            updateResult
        )
    }

    async function updateFilter(viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): Promise<void> {
        const existingFilter = getSavedFilters(viewId).find(filter => filter.id === savedFilterId)
        if (existingFilter === undefined) {
            options.showToast({
                severity: 'error',
                summary: 'Failed to update filter',
                detail: `Filter "${savedFilterId}" does not exist`,
                life: 3000
            })
            return
        }

        const updateResult = await updateViewData(viewId, (prevViewData) => {
            const index = prevViewData.savedFilters.findIndex(existing => existing.id === savedFilterId)
            if (index === -1) {
                return prevViewData
            }

            const updatedFilter: SavedFilter = {
                ...prevViewData.savedFilters[index],
                ...updates
            }

            const nextSavedFilters = [...prevViewData.savedFilters]
            nextSavedFilters[index] = updatedFilter
            return {
                ...prevViewData,
                savedFilters: nextSavedFilters
            }
        })

        Result.match(
            {
                whenError: (error) => {
                    options.showToast({
                        severity: 'error',
                        summary: 'Failed to update filter',
                        detail: `Failed to update filter ${existingFilter.name}": ${userDataManagerErrorToToast(error).detail}`,
                        life: 3000
                    })
                },
                whenSuccess: () => {
                    options.showToast({
                        severity: 'success',
                        summary: 'Filter updated',
                        detail: `Filter "${existingFilter.name}" has been updated successfully`,
                        life: 3000
                    })
                }
            },
            updateResult
        )
    }

    async function deleteFilter(viewId: ViewId, savedFilterId: SavedFilterId): Promise<void> {
        const existingFilter = getSavedFilters(viewId).find(filter => filter.id === savedFilterId)
        if (existingFilter === undefined) {
            options.showToast({
                severity: 'error',
                summary: 'Failed to update filter',
                detail: `Filter "${savedFilterId}" does not exist`,
                life: 3000
            })
            return
        }

        const prevViewData = getViewData(viewId)
        const nextSavedFilters = prevViewData.savedFilters.filter(filter => filter.id !== savedFilterId)
        const updateResult = await updateViewData(viewId, (prev) => ({
            ...prev,
            savedFilters: nextSavedFilters
        }))

        Result.match(
            {
                whenError: (error) => {
                    options.showToast({
                        severity: 'error',
                        summary: 'Failed to delete filter',
                        detail: `Failed to delete filter ${existingFilter.name}": ${userDataManagerErrorToToast(error).detail}`,
                        life: 3000
                    })
                },
                whenSuccess: () => {
                    options.showToast({
                        severity: 'success',
                        summary: 'Filter deleted',
                        detail: `Filter "${existingFilter.name}" has been deleted successfully`,
                        life: 3000
                    })
                }
            },
            updateResult
        )
    }

    // Prime from localStorage immediately for sync consumers
    loadUserDataWithCache()

    const ready: Promise<void> = (async () => {
        const localUserData = loadUserDataWithCache()

        let dataFromLoadCallback: UserDataJson | null = null
        if (options.load) {
            try {
                const result = await options.load({ showToast: options.showToast, Result: Result })
                if (Result.isFailure(result)) {
                    options.showToast(userDataManagerErrorToToast(externalLoadFailed(result.error)))
                } else {
                    dataFromLoadCallback = result.value
                }
            } catch (err) {
                options.showToast(userDataManagerErrorToToast(externalLoadFailed('' + (err instanceof Error ? err.message : err), err)))
            }
        }

        // If no remote data provided (no loader or loader returned null),
        // pick local then migrate and persist accordingly.
        if (!dataFromLoadCallback) {
            const migratedResult = applyUserDataMigrations(localUserData, { filterSchemasByViewId })
            if (Result.isFailure(migratedResult)) {
                console.error('Failed to read user data:', userDataMigrationErrorToMessage(migratedResult.error), migratedResult.error)
                options.showToast({
                    severity: 'error',
                    summary: 'Failed to read user data',
                    detail: userDataMigrationErrorToMessage(migratedResult.error),
                    life: 5000
                })
                cachedUserData = defaultUserData()
                return
            }

            const saveUserDataResult = await saveUserData(migratedResult.value, { localStorageOnly: false, bumpRevision: false })
            if (Result.isFailure(saveUserDataResult)) {
                options.showToast(userDataManagerErrorToToast(saveUserDataResult.error))
                cachedUserData = defaultUserData()
            }
            return
        }

        const remoteUserData: UserData = fromUserDataJson(dataFromLoadCallback as UserDataJson, filterSchemasByViewId)

        // Choose source with greater or equal revision (prefer remote on tie)
        const remoteDataIsNewer = remoteUserData.revision >= localUserData.revision
        const chosenUserDataBeforeMigration = remoteDataIsNewer ? remoteUserData : localUserData
        const migratedUserDataResult = applyUserDataMigrations(chosenUserDataBeforeMigration, { filterSchemasByViewId })
        if (Result.isFailure(migratedUserDataResult)) {
            console.error('Failed to read user data:', userDataMigrationErrorToMessage(migratedUserDataResult.error), migratedUserDataResult.error)
            options.showToast({
                severity: 'error',
                summary: 'Failed to read user data',
                detail: userDataMigrationErrorToMessage(migratedUserDataResult.error),
                life: 5000
            })
            cachedUserData = defaultUserData()
            return
        }

        const migratedUserData = migratedUserDataResult.value
        const wasChangedByMigration = migratedUserData.formatRevision !== chosenUserDataBeforeMigration.formatRevision

        const saveUserDataResult: Result<UserDataManagerError, UserDataJson> =
            wasChangedByMigration
                ? await saveUserData(migratedUserData, { localStorageOnly: false, bumpRevision: true })
                : remoteDataIsNewer
                    // Remote is authoritative and unchanged by migrations; persist locally only.
                    ? await saveUserData(migratedUserData, { localStorageOnly: true, bumpRevision: false })
                    // Local is newer; sync to remote as well.
                    : await saveUserData(migratedUserData, { localStorageOnly: false, bumpRevision: false })

        if (Result.isFailure(saveUserDataResult)) {
            options.showToast(userDataManagerErrorToToast(saveUserDataResult.error))
            cachedUserData = defaultUserData()
        }
    })()

    return {
        ready,
        getPreferences,
        updatePreferences,
        getViewData,
        setColumnOrder,
        setHiddenColumns,
        setRowsPerPage,
        getSavedFilters,
        createFilter,
        updateFilter,
        deleteFilter
    };
}

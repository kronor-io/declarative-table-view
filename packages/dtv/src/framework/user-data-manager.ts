import { FilterGroups } from './filters';
import { CURRENT_FORMAT_REVISION, SavedFilter, SavedFilterId } from './saved-filters';
import type { FilterState } from './state';
import { defaultUserData, defaultViewData, fromUserDataJson, mergeViewsJson, toUserDataJson, UserData, UserDataJson, UserPreferences, ViewData, ViewDataJson } from './user-data';
import { applyUserDataMigrations, userDataMigrationErrorToMessage } from './user-data.migrations';
import { ViewId } from './view';
import type { ShowToastFn } from './toast'
import { errorMessage, externalLoadFailed, externalSaveFailed, localStorageFailed, UserDataManagerError, userDataManagerErrorToToast, userDataStorageErrorToMessage } from './user-data-errors'
import { Result } from './result'
import { createSerialQueue } from './serial-queue'
import { cachedValue } from './cached-value'
import { readUserDataJson, USER_DATA_LOCALSTORAGE_KEY, writeUserDataJson, type UserDataStorageError } from './user-data-storage'

export { USER_DATA_LOCALSTORAGE_KEY }

export interface UserDataManager {
    /**
     * Resolves once an optional async load callback has completed (success or failure).
     * Useful for callers that need to await remote/user-provided hydration.
     */
    ready: Promise<void>

    /**
     * Re-reads the user data another tab wrote to localStorage, so this tab works from
     * that revision and content. Meant for a `storage` event listener.
     */
    refreshFromLocalStorage(): void

    getPreferences(): UserPreferences
    updatePreferences(updateFunc: (prev: UserPreferences) => UserPreferences): Promise<UserPreferences>

    getViewData(viewId: ViewId): ViewData
    setColumnOrder(viewId: ViewId, order: string[] | null): Promise<ViewData>
    setHiddenColumns(viewId: ViewId, hidden: string[] | null): Promise<ViewData>
    setRowsPerPage(viewId: ViewId, rowsPerPage: number): Promise<ViewData>
    setSyncFilterStateToUserData(viewId: ViewId, enabled: boolean): Promise<ViewData>
    setPersistedFilterState(viewId: ViewId, filterState: FilterState | null): Promise<ViewData>

    getSavedFilters(viewId: ViewId): SavedFilter[]

    // Saved filter manager API (backed by user data)
    createFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): Promise<void>
    updateFilter(viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): Promise<void>
    deleteFilter(viewId: ViewId, savedFilterId: SavedFilterId): Promise<void>
}

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

/** The remote's copy of the user data, parsed and as received. */
type RemoteCopy = { userData: UserData; json: UserDataJson }

/** Where and how a write goes. */
type Persist = {
    /** Give the data a revision above everything known here. */
    bumpRevision: boolean
    /** Send the data to the remote as well as to localStorage. */
    remote: boolean
    /**
     * Views of a newer copy the data was derived from. Views this manager has no schema for
     * are carried along from here, and otherwise from what localStorage holds.
     */
    baseViews?: Record<ViewId, ViewDataJson> | null
}

export function createUserDataManager(
    filterGroupsByViewId: Record<ViewId, FilterGroups>,
    options: UserDataManagerOptions
): UserDataManager {
    const parse = (json: UserDataJson): UserData => fromUserDataJson(json, filterGroupsByViewId)
    const serialize = (userData: UserData): UserDataJson => toUserDataJson(userData, filterGroupsByViewId)

    // Parsing hydrates every view's filter state against the current schemas, so a
    // malformed payload throws. Contained here so one bad payload does not take down all
    // user data (saved filters, column order, rows per page) with it.
    function parseStored(json: UserDataJson): Result<UserDataStorageError, UserData> {
        try {
            return Result.success(parse(json))
        } catch (err) {
            return Result.failure({ kind: 'malformed', cause: err })
        }
    }

    /** What localStorage holds, for the merges and revisions below. */
    const storedUserDataJson = (): UserDataJson | null => Result.getOrElse(null, readUserDataJson())

    /** The user data in localStorage; defaults when there is none or it cannot be read. */
    function readLocalUserData(): UserData {
        const stored = Result.flatMap(
            json => json === null ? Result.success(null) : parseStored(json),
            readUserDataJson()
        )
        return Result.match({
            whenError: (error) => {
                console.error('Failed to read user data:', userDataStorageErrorToMessage(error), error.cause)
                return defaultUserData()
            },
            whenSuccess: (userData) => userData ?? defaultUserData()
        }, stored)
    }

    /** This tab's copy of the user data, read from localStorage on first use. */
    const cachedUserData = cachedValue(readLocalUserData)

    // Set when the stored data cannot be migrated to this version. The manager then works
    // from defaults in memory and leaves both stores alone, so data a newer version wrote is
    // not replaced by what this version makes of it.
    let readOnly = false

    /**
     * Re-reads what another tab wrote to localStorage. A copy with a lower revision than
     * the cached one is ignored: it can only come from a writer that did not see this tab's
     * latest write, and adopting it would roll that write back.
     */
    function refreshFromLocalStorage(): void {
        if (readOnly) return
        const stored = readLocalUserData()
        if (stored.revision >= cachedUserData().revision) {
            cachedUserData.set(stored)
        }
    }

    /**
     * The latest user data this tab can know about: the cached copy, or what another tab
     * wrote to localStorage since, when that is newer.
     */
    function latestUserData(): UserData {
        refreshFromLocalStorage()
        return cachedUserData()
    }

    /* The two stores */

    function writeLocally(json: UserDataJson): Result<UserDataManagerError, void> {
        return Result.mapFailure(writeUserDataJson(json), localStorageFailed)
    }

    async function writeRemotely(json: UserDataJson): Promise<Result<UserDataManagerError, void>> {
        if (!options.save) return Result.success(undefined)
        try {
            const saved = await options.save({ data: json, showToast: options.showToast, Result: Result })
            return Result.mapFailure(saved, externalSaveFailed)
        } catch (err) {
            return Result.failure(externalSaveFailed(errorMessage(err), err))
        }
    }

    /** The remote's copy; `null` when it holds nothing yet. */
    async function loadRemote(): Promise<Result<UserDataManagerError, RemoteCopy | null>> {
        if (!options.load) return Result.success(null)
        try {
            const loaded = await options.load({ showToast: options.showToast, Result: Result })
            return Result.flatMap(
                json => json === null ? Result.success(null) : parseRemote(json),
                Result.mapFailure(loaded, externalLoadFailed)
            )
        } catch (err) {
            return Result.failure(externalLoadFailed(errorMessage(err), err))
        }
    }

    function parseRemote(json: UserDataJson): Result<UserDataManagerError, RemoteCopy> {
        return Result.bimap({
            mapFailure: (error) => {
                console.error('Failed to read remote user data:', error.cause)
                return externalLoadFailed('Remote user data could not be read; continuing with locally stored data.', error.cause)
            },
            mapSuccess: (userData) => ({ userData, json })
        }, parseStored(json))
    }

    async function persist(userData: UserData, how: Persist): Promise<Result<UserDataManagerError, UserData>> {
        if (readOnly) return Result.success(cachedUserData.set(userData))

        const stored = storedUserDataJson()
        // A bumped revision is above everything known here, other tabs' writes included.
        const revision = how.bumpRevision
            ? Math.max(userData.revision, cachedUserData().revision, stored?.revision ?? 0) + 1
            : userData.revision
        const persisted: UserData = { ...userData, revision }
        const json = serialize(persisted)
        // Views this manager has no schema for are carried along; see `Persist.baseViews`.
        const storedJson: UserDataJson = { ...json, views: mergeViewsJson(stored?.views, how.baseViews, json.views) }

        const local = writeLocally(storedJson)
        cachedUserData.set(persisted)
        const remote = how.remote ? await writeRemotely(storedJson) : Result.success<void, UserDataManagerError>(undefined)
        // A remote failure is the one to act on; a local one is reported once the rest went well.
        return Result.mapResult(() => persisted, Result.isFailure(remote) ? remote : local)
    }

    function reportFailure(result: Result<UserDataManagerError, unknown>): void {
        if (Result.isFailure(result)) {
            options.showToast(userDataManagerErrorToToast(result.error))
        }
    }

    /* Initial load: load, choose the source, migrate, persist once. */

    async function synchronize(retryRejectedPush: boolean): Promise<void> {
        // Without a loader nothing is awaited, so local-only data is migrated and available
        // synchronously, as soon as the manager is created.
        const remote = options.load ? await loadRemote() : Result.success<RemoteCopy | null, UserDataManagerError>(null)
        reportFailure(remote)

        // Read local data only now: another tab may have written while the load was in flight.
        const local = latestUserData()
        // The remote copy is the source when it is at least as new (prefer remote on a tie).
        const remoteCopy = Result.isSuccess(remote) && remote.value !== null && remote.value.userData.revision >= local.revision
            ? remote.value
            : null
        const source = remoteCopy?.userData ?? local

        const migrated = applyUserDataMigrations(source, { filterGroupsByViewId })
        if (Result.isFailure(migrated)) {
            console.error('Failed to read user data:', userDataMigrationErrorToMessage(migrated.error), migrated.error)
            options.showToast({
                severity: 'error',
                summary: 'Failed to read user data',
                detail: userDataMigrationErrorToMessage(migrated.error),
                life: 5000
            })
            readOnly = true
            cachedUserData.set(defaultUserData())
            return
        }
        const changedByMigration = migrated.value.formatRevision !== source.formatRevision

        // The remote receives the data when it is known to be behind (it holds nothing, or
        // the local copy is newer) or the migration changed what it holds. After a failed
        // load it is unknown and left alone. A remote that is up to date is not written to.
        const how: Persist = {
            bumpRevision: changedByMigration,
            remote: Result.isSuccess(remote) && (remoteCopy === null || changedByMigration),
            baseViews: remoteCopy?.json.views
        }
        const persisted = await persist(migrated.value, how)
        if (Result.isFailure(persisted) && how.remote && retryRejectedPush) {
            // The remote rejected the push: it moved on while this manager was starting, by
            // another tab's write or by a write of this tab that was still in flight. Load it
            // again and settle on what it holds now.
            return synchronize(false)
        }
        // A failed push leaves the data in place: it is valid, only unsynced. Resetting to
        // defaults would make every later write start from revision 0 and be rejected.
        reportFailure(persisted)
    }

    const ready: Promise<void> = synchronize(true)

    // Writes run one at a time, after the initial load, so they reach the remote in order
    // and a change made during the load is applied to the reconciled data.
    const writes = createSerialQueue(ready)

    /**
     * Applies `change` to the latest user data and persists the result. A write the remote
     * rejects means it holds a revision at or above the one just tried, written by another
     * tab or device: `change` is applied on top of the remote copy and written once more.
     * `change` may therefore be applied twice and has to be idempotent. Any other failure
     * (the remote cannot be reached) leaves the local copy with the change and is reported.
     */
    function commitChange(change: (prev: UserData) => UserData): Promise<Result<UserDataManagerError, UserData>> {
        return writes.enqueue(async () => {
            const attempt = await persist(change(latestUserData()), { bumpRevision: true, remote: true })
            if (Result.isSuccess(attempt) || !options.load) return attempt

            const remote = await loadRemote()
            if (Result.isFailure(remote) || remote.value === null) return attempt
            // A remote below the revision just tried did not reject it; writing again would not help.
            if (remote.value.userData.revision < cachedUserData().revision) return attempt

            return persist(change(remote.value.userData), {
                bumpRevision: true,
                remote: true,
                baseViews: remote.value.json.views
            })
        })
    }

    /* API */

    function getPreferences(): UserPreferences {
        return cachedUserData().preferences
    }

    async function updatePreferences(updateFunc: ((prevUserPrefs: UserPreferences) => UserPreferences)): Promise<UserPreferences> {
        const result = await commitChange(prevUserData => ({
            ...prevUserData,
            preferences: updateFunc(prevUserData.preferences)
        }))
        reportFailure(result)
        return getPreferences()
    }

    function getViewData(viewId: ViewId): ViewData {
        return cachedUserData().views[viewId] ?? defaultViewData()
    }

    function updateViewData(viewId: ViewId, updateFunc: ((prevViewData: ViewData) => ViewData)): Promise<Result<UserDataManagerError, ViewData>> {
        return commitChange(prevUserData => ({
            ...prevUserData,
            views: {
                ...prevUserData.views,
                [viewId]: updateFunc(prevUserData.views[viewId] ?? defaultViewData())
            }
        })).then(result => Result.mapResult(userData => userData.views[viewId] ?? defaultViewData(), result))
    }

    // The setters keep the change locally when the remote write fails, and say so.
    async function setViewDataField(viewId: ViewId, updateFunc: ((prevViewData: ViewData) => ViewData)): Promise<ViewData> {
        const result = await updateViewData(viewId, updateFunc)
        reportFailure(result)
        return getViewData(viewId)
    }

    function setColumnOrder(viewId: ViewId, columnOrder: string[] | null): Promise<ViewData> {
        return setViewDataField(viewId, prevViewData => ({ ...prevViewData, columnOrder }))
    }

    function setHiddenColumns(viewId: ViewId, columns: string[]): Promise<ViewData> {
        return setViewDataField(viewId, prevViewData => ({ ...prevViewData, hiddenColumns: columns }))
    }

    function setRowsPerPage(viewId: ViewId, rowsPerPage: number): Promise<ViewData> {
        return setViewDataField(viewId, prevViewData => ({ ...prevViewData, rowsPerPage }))
    }

    function setSyncFilterStateToUserData(viewId: ViewId, enabled: boolean): Promise<ViewData> {
        return setViewDataField(viewId, prevViewData => ({
            ...prevViewData,
            syncFilterStateToUserData: enabled,
            persistedFilterState: enabled ? prevViewData.persistedFilterState : null
        }))
    }

    function setPersistedFilterState(viewId: ViewId, filterState: FilterState | null): Promise<ViewData> {
        return setViewDataField(viewId, prevViewData => ({ ...prevViewData, persistedFilterState: filterState }))
    }

    /* Saved filters */

    function getSavedFilters(viewId: ViewId): SavedFilter[] {
        return cachedUserData().views[viewId]?.savedFilters ?? []
    }

    /** Tells the user how a saved-filter change went; `verb` and `done` as in "save" / "saved". */
    function reportSavedFilterResult(
        result: Result<UserDataManagerError, unknown>,
        filterName: string,
        { verb, done }: { verb: string; done: string }
    ): void {
        Result.match(
            {
                whenError: (error) => {
                    options.showToast({
                        severity: 'error',
                        summary: `Failed to ${verb} filter`,
                        detail: `Failed to ${verb} filter "${filterName}": ${userDataManagerErrorToToast(error).detail}`,
                        life: 3000
                    })
                },
                whenSuccess: () => {
                    options.showToast({
                        severity: 'success',
                        summary: `Filter ${done}`,
                        detail: `Filter "${filterName}" has been ${done} successfully`,
                        life: 3000
                    })
                }
            },
            result
        )
    }

    function reportMissingSavedFilter(savedFilterId: SavedFilterId, verb: string): void {
        options.showToast({
            severity: 'error',
            summary: `Failed to ${verb} filter`,
            detail: `Filter "${savedFilterId}" does not exist`,
            life: 3000
        })
    }

    async function createFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): Promise<void> {
        const savedFilter: SavedFilter = {
            ...filter,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            formatRevision: CURRENT_FORMAT_REVISION
        }
        const result = await updateViewData(savedFilter.view, prevViewData => ({
            ...prevViewData,
            savedFilters: [...prevViewData.savedFilters.filter(filter => filter.id !== savedFilter.id), savedFilter]
        }))
        reportSavedFilterResult(result, filter.name, { verb: 'save', done: 'saved' })
    }

    async function updateFilter(viewId: ViewId, savedFilterId: SavedFilterId, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): Promise<void> {
        const existingFilter = getSavedFilters(viewId).find(filter => filter.id === savedFilterId)
        if (existingFilter === undefined) {
            reportMissingSavedFilter(savedFilterId, 'update')
            return
        }

        const result = await updateViewData(viewId, prevViewData => ({
            ...prevViewData,
            savedFilters: prevViewData.savedFilters.map(filter => filter.id === savedFilterId ? { ...filter, ...updates } : filter)
        }))
        reportSavedFilterResult(result, existingFilter.name, { verb: 'update', done: 'updated' })
    }

    async function deleteFilter(viewId: ViewId, savedFilterId: SavedFilterId): Promise<void> {
        const existingFilter = getSavedFilters(viewId).find(filter => filter.id === savedFilterId)
        if (existingFilter === undefined) {
            reportMissingSavedFilter(savedFilterId, 'delete')
            return
        }

        const result = await updateViewData(viewId, prevViewData => ({
            ...prevViewData,
            savedFilters: prevViewData.savedFilters.filter(filter => filter.id !== savedFilterId)
        }))
        reportSavedFilterResult(result, existingFilter.name, { verb: 'delete', done: 'deleted' })
    }

    return {
        ready,
        refreshFromLocalStorage,
        getPreferences,
        updatePreferences,
        getViewData,
        setColumnOrder,
        setHiddenColumns,
        setRowsPerPage,
        setSyncFilterStateToUserData,
        setPersistedFilterState,
        getSavedFilters,
        createFilter,
        updateFilter,
        deleteFilter
    };
}

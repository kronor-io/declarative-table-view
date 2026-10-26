import type { FilterId } from './filters'
import type { ShowToastOptions } from './toast'
import type { ViewResets } from './user-data'
import type { UserDataStorageError } from './user-data-storage'
import type { ViewId } from './view'

export const errorMessage = (err: unknown): string => err instanceof Error ? err.message : String(err)

export function userDataStorageErrorToMessage(error: UserDataStorageError): string {
    switch (error.kind) {
        case 'inaccessible':
            return `localStorage is not accessible (${errorMessage(error.cause)})`
        case 'malformed':
            return `the stored user data is not valid JSON (${errorMessage(error.cause)})`
    }
}

export type UserDataManagerError =
    | {
        kind: 'externalSaveFailed'
        message: string
        cause?: unknown
    }
    | {
        kind: 'externalLoadFailed'
        message: string
        cause?: unknown
    }
    | {
        kind: 'localStorageFailed'
        message: string
        cause?: unknown
    }

export function externalSaveFailed(message: string, cause?: unknown): UserDataManagerError {
    return {
        kind: 'externalSaveFailed',
        message,
        cause
    }
}

export function externalLoadFailed(message: string, cause?: unknown): UserDataManagerError {
    return {
        kind: 'externalLoadFailed',
        message,
        cause
    }
}

export function localStorageFailed(error: UserDataStorageError): UserDataManagerError {
    return {
        kind: 'localStorageFailed',
        message: userDataStorageErrorToMessage(error),
        cause: error.cause
    }
}

/**
 * Tells the user which filters were reset because their view's definition changed since
 * they were stored. `filterLabel` names a filter of a view.
 */
export function viewResetsToToast(resets: ViewResets[], filterLabel: (viewId: ViewId, filterId: FilterId) => string): ShowToastOptions {
    const labels = (viewId: ViewId, filterIds: FilterId[]) => filterIds.map(filterId => filterLabel(viewId, filterId)).join(', ')
    const details = resets.flatMap(reset => [
        ...(reset.persistedFilterState.length > 0 ? [`current filters: ${labels(reset.viewId, reset.persistedFilterState)}`] : []),
        ...reset.savedFilters.map(savedFilter => `saved filter "${savedFilter.name}": ${labels(reset.viewId, savedFilter.filterIds)}`)
    ])
    return {
        severity: 'warn',
        summary: 'Some filters were reset',
        detail: `The table changed since these filters were stored, so they were reset or lost values that no longer exist. ${details.join('; ')}`,
        life: 8000
    }
}

export function userDataManagerErrorToToast(err: UserDataManagerError): ShowToastOptions {
    switch (err.kind) {
        case 'localStorageFailed':
            return {
                severity: 'warn',
                summary: 'Saving user data locally failed',
                detail: err.message,
                life: 4000
            }
        case 'externalSaveFailed':
            return {
                severity: 'error',
                summary: 'Syncing user data failed',
                detail: err.message,
                life: 4000
            }
        case 'externalLoadFailed':
            return {
                severity: 'error',
                summary: 'Loading user data failed',
                detail: err.message,
                life: 4000
            }
    }
}

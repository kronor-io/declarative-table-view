import type { ShowToastOptions } from './toast'
import type { UserDataStorageError } from './user-data-storage'

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

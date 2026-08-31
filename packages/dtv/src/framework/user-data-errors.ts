import type { ShowToastOptions } from './toast'

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

export function userDataManagerErrorToToast(err: UserDataManagerError): ShowToastOptions {
    switch (err.kind) {
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

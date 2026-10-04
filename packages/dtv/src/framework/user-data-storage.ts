import type { UserDataJson } from './user-data'
import { Result } from './result'

export const USER_DATA_LOCALSTORAGE_KEY = 'dtvUserData'

export type UserDataStorageError =
    /** localStorage threw: disabled, full, or otherwise unavailable. */
    | { kind: 'inaccessible'; cause: unknown }
    /** What is stored is not user data JSON. */
    | { kind: 'malformed'; cause: unknown }

const inaccessible = (cause: unknown): UserDataStorageError => ({ kind: 'inaccessible', cause })
const malformed = (cause: unknown): UserDataStorageError => ({ kind: 'malformed', cause })

/** The stored user data JSON; `null` when nothing is stored. */
export function readUserDataJson(): Result<UserDataStorageError, UserDataJson | null> {
    let stored: string | null
    try {
        stored = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)
    } catch (err) {
        return Result.failure(inaccessible(err))
    }

    if (stored === null) return Result.success(null)

    try {
        const parsed: unknown = JSON.parse(stored)
        return parsed !== null && typeof parsed === 'object'
            ? Result.success(parsed as UserDataJson)
            : Result.failure(malformed(new Error('not an object')))
    } catch (err) {
        return Result.failure(malformed(err))
    }
}

export function writeUserDataJson(userDataJson: UserDataJson): Result<UserDataStorageError, void> {
    try {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson))
        return Result.success(undefined)
    } catch (err) {
        return Result.failure(inaccessible(err))
    }
}

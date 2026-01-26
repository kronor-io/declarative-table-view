export type Failure<E> = {
    tag: 'failure'
    error: E
}

export type Success<T> = {
    tag: 'success'
    value: T
}

// Result-like sum type.
// Convention: Failure = error/negative branch, Success = success/positive branch.
export type Result<E, T> = Failure<E> | Success<T>

export function failure<E, T = never>(error: E): Result<E, T> {
    return { tag: 'failure', error }
}

export function success<T, E = never>(value: T): Result<E, T> {
    return { tag: 'success', value }
}

export function isFailure<E, T>(value: Result<E, T>): value is Failure<E> {
    return value.tag === 'failure'
}

export function isSuccess<E, T>(value: Result<E, T>): value is Success<T> {
    return value.tag === 'success'
}

export function mapResult<E, A, B>(mapSuccess: (v: A) => B, value: Result<E, A>): Result<E, B> {
    return isSuccess(value) ? success(mapSuccess(value.value)) : value
}

export function mapFailure<E, T, E2>(value: Result<E, T>, mapFailure: (v: E) => E2): Result<E2, T> {
    return isFailure(value) ? failure(mapFailure(value.error)) : value
}

export function bimap<E, T, E2, T2>(
    {
        mapFailure,
        mapSuccess
    }: {
        mapFailure: (e: E) => E2
        mapSuccess: (t: T) => T2
    },
    value: Result<E, T>
): Result<E2, T2> {
    return isFailure(value)
        ? failure(mapFailure(value.error))
        : success(mapSuccess(value.value))
}

export function unwrapResult<E, T>(value: Result<E, T>): T {
    if (isSuccess(value)) return value.value
    throw new Error('Tried to unwrap Failure')
}

export function match<E, T, R>({ whenError: fnE, whenSuccess: fnT }: { whenError: (e: E) => R, whenSuccess: (t: T) => R }, value: Result<E, T>): R {
    return isSuccess(value) ? fnT(value.value) : fnE(value.error)
}

export const Result = {
    failure,
    success,
    isFailure,
    isSuccess,
    mapResult,
    mapFailure,
    bimap,
    unwrapResult,
    match
} as const

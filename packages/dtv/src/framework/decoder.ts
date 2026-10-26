import { Result } from './result'

/**
 * Decoders for data read back from storage: `unknown` in, a typed value out.
 *
 * The decoded values are JSON, so there are no encoders: writing a decoded value back is
 * `JSON.stringify`. Objects keep the fields their decoder does not know, so data this
 * version of dtv only reads and writes back loses nothing.
 *
 * Some decoders are lenient: they fall back or drop an invalid part instead of failing the
 * whole input. What they worked around is collected in the context's `issues`.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export type DecodeIssue = { path: string; message: string }

/** Where a decoder is in the input, and the problems decoders worked around so far. */
export type DecodeContext = { path: string; issues: DecodeIssue[] }

export type Decoder<T> = (input: unknown, context: DecodeContext) => Result<DecodeIssue, T>

export type Infer<D> = D extends Decoder<infer T> ? T : never

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'an array'
    return typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`
}

function fail<T>(context: DecodeContext, expected: string, actual: unknown): Result<DecodeIssue, T> {
    return Result.failure({ path: context.path, message: `expected ${expected}, got ${describe(actual)}` })
}

function at(context: DecodeContext, key: string | number): DecodeContext {
    const segment = typeof key === 'number'
        ? `[${key}]`
        : /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`
    return { path: `${context.path}${segment}`, issues: context.issues }
}

/** Decodes `input`, reporting paths from `$`. */
export function decode<T>(decoder: Decoder<T>, input: unknown): { result: Result<DecodeIssue, T>; issues: DecodeIssue[] } {
    const context: DecodeContext = { path: '$', issues: [] }
    return { result: decoder(input, context), issues: context.issues }
}

export const string: Decoder<string> = (input, context) =>
    typeof input === 'string' ? Result.success(input) : fail(context, 'a string', input)

export const number: Decoder<number> = (input, context) =>
    typeof input === 'number' && Number.isFinite(input) ? Result.success(input) : fail(context, 'a number', input)

export const boolean: Decoder<boolean> = (input, context) =>
    typeof input === 'boolean' ? Result.success(input) : fail(context, 'a boolean', input)

/** Any value, taken to be JSON: what is decoded was read from JSON. */
export const json: Decoder<Json> = (input) => Result.success((input === undefined ? null : input) as Json)

export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
    return (input, context) => input === null ? Result.success(null) : decoder(input, context)
}

/** An absent field decodes to `fallback()`; an invalid one too, as an issue. */
export function withDefault<T>(decoder: Decoder<T>, fallback: () => T): Decoder<T> {
    return (input, context) => {
        if (input === undefined) return Result.success(fallback())
        const decoded = decoder(input, context)
        if (Result.isSuccess(decoded)) return decoded
        context.issues.push({ path: decoded.error.path, message: `${decoded.error.message}; using the default` })
        return Result.success(fallback())
    }
}

export function map<A, B>(decoder: Decoder<A>, f: (value: A) => B): Decoder<B> {
    return (input, context) => Result.mapResult(f, decoder(input, context))
}

/** For recursive decoders. */
export function lazy<T>(decoder: () => Decoder<T>): Decoder<T> {
    return (input, context) => decoder()(input, context)
}

export function array<T>(item: Decoder<T>): Decoder<T[]> {
    return (input, context) => {
        if (!Array.isArray(input)) return fail(context, 'an array', input)
        const items: T[] = []
        for (const [index, element] of input.entries()) {
            const decoded = item(element, at(context, index))
            if (Result.isFailure(decoded)) return decoded
            items.push(decoded.value)
        }
        return Result.success(items)
    }
}

/** An array whose invalid items are dropped, as issues. */
export function arrayDroppingInvalid<T>(item: Decoder<T>): Decoder<T[]> {
    return (input, context) => {
        if (!Array.isArray(input)) return fail(context, 'an array', input)
        const items: T[] = []
        for (const [index, element] of input.entries()) {
            const decoded = item(element, at(context, index))
            if (Result.isSuccess(decoded)) {
                items.push(decoded.value)
            } else {
                context.issues.push({ path: decoded.error.path, message: `${decoded.error.message}; dropped` })
            }
        }
        return Result.success(items)
    }
}

/** A record whose invalid entries are dropped, as issues. */
export function recordDroppingInvalid<T>(entry: Decoder<T>): Decoder<Record<string, T>> {
    return (input, context) => {
        if (!isRecord(input)) return fail(context, 'an object', input)
        const entries: Record<string, T> = {}
        for (const [key, value] of Object.entries(input)) {
            const decoded = entry(value, at(context, key))
            if (Result.isSuccess(decoded)) {
                entries[key] = decoded.value
            } else {
                context.issues.push({ path: decoded.error.path, message: `${decoded.error.message}; dropped` })
            }
        }
        return Result.success(entries)
    }
}

type Fields = Record<string, Decoder<unknown>>
type Decoded<F extends Fields> = { [K in keyof F]: Infer<F[K]> }

/**
 * An object with the given fields. An absent field is decoded from `undefined`, so
 * `withDefault` can fill it in. Fields not listed are kept as they are.
 */
export function object<F extends Fields>(fields: F): Decoder<Decoded<F>> {
    return (input, context) => {
        if (!isRecord(input)) return fail(context, 'an object', input)
        const decoded: Record<string, unknown> = { ...input }
        for (const [key, field] of Object.entries(fields)) {
            const value = field(input[key], at(context, key))
            if (Result.isFailure(value)) return value
            decoded[key] = value.value
        }
        return Result.success(decoded as Decoded<F>)
    }
}

/** One of several object shapes, told apart by the string field `tag`. */
export function taggedUnion<T>(tag: string, variants: Record<string, Decoder<T>>): Decoder<T> {
    return (input, context) => {
        if (!isRecord(input)) return fail(context, 'an object', input)
        const variant = input[tag]
        const decoder = typeof variant === 'string' && Object.prototype.hasOwnProperty.call(variants, variant) ? variants[variant] : undefined
        if (decoder === undefined) {
            return fail(at(context, tag), `one of ${Object.keys(variants).map(name => JSON.stringify(name)).join(', ')}`, variant)
        }
        return decoder(input, context)
    }
}

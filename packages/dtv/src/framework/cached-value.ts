/**
 * A cached copy of a value: computed on first read (not when created) and kept from then
 * on, and replaceable when the caller learns of a newer value. Reading never recomputes
 * once a value is kept.
 */
export type CachedValue<T> = {
    (): T
    /** Replaces the kept value and returns it. */
    set(value: T): T
}

export function cachedValue<T>(compute: () => T): CachedValue<T> {
    // Boxed, so a computed `undefined` or `null` counts as kept too.
    let kept: { value: T } | null = null

    const read = (): T => {
        if (kept === null) {
            kept = { value: compute() }
        }
        return kept.value
    }

    return Object.assign(read, {
        set: (value: T): T => {
            kept = { value }
            return value
        }
    })
}

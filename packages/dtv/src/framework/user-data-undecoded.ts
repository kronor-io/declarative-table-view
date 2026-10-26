import type { DataOrdering } from './data-ordering'
import * as D from './decoder'
import type { Json } from './decoder'
import { isOrderDirection } from './order-direction'
import { Result } from './result'
import type { ViewId } from './view'

/*
 * User data as dtv stores it, decoded up to the views: everything outside the views is
 * decoded, and each view is an `UndecodedViewData` — valid as far as dtv's storage format
 * goes, but not yet decoded against its view definition. That takes the view's filter
 * schema (dates, custom operators, legacy leaves) and happens per view, see
 * `decodeViewData` in ./user-data.
 */

/**
 * A leaf's value. `legacy` is a leaf written before filter values were stored as
 * `empty | value` (2026-03-26): which `FilterValue` it stands for depends on the filter's
 * control, so it is resolved when the view is decoded.
 */
export type UndecodedFilterValue =
    | { type: 'empty' }
    | { type: 'value'; value: Json }
    | { type: 'legacy'; raw: Json }

export type UndecodedFilterFormState =
    | { type: 'leaf'; value: UndecodedFilterValue }
    | { type: 'and' | 'or'; children: UndecodedFilterFormState[] }
    | { type: 'not'; child: UndecodedFilterFormState }

/** Filter states by filter id. Filters left empty are not stored. */
export type UndecodedFilterState = Record<string, UndecodedFilterFormState>

export type UndecodedSavedFilter = {
    id: string
    name: string
    view: string
    createdAt: string
    formatRevision: string
    state: UndecodedFilterState
}

export type UndecodedViewData = {
    columnOrder: string[] | null
    hiddenColumns: string[]
    rowsPerPage: number | null
    syncOrderingToUserData: boolean
    /** The ordering the user sorted by: a field the view orders by, not a column id. */
    ordering: DataOrdering | null
    syncFilterStateToUserData: boolean
    persistedFilterState: UndecodedFilterState | null
    savedFilters: UndecodedSavedFilter[]
    /** The revision of the view definition the data was written for. */
    definitionRevision: number
}

export type UserPreferences = {
    /**
     * When set, overrides the App option `syncFilterStateToUrl`.
     * - `true`: always sync filter state to URL
     * - `false`: never sync filter state to URL
     * - `null`: use the App option
     */
    syncFilterStateToUrlOverride: boolean | null;
    /**
     * When enabled, closes the filters panel after applying the current filter state.
     */
    closeFilterPanelOnApply: boolean;
}

export type UserDataWithUndecodedViews = {
    preferences: UserPreferences
    views: Record<ViewId, UndecodedViewData>
    /** Monotonic per-writer revision number, incremented on each persisted change. */
    revision: number
    formatRevision: string
}

/** The definition revision of data written before views had revisions, and of views without migrations. */
export const BASELINE_DEFINITION_REVISION = 1

export const defaultUserPreferences: UserPreferences = {
    syncFilterStateToUrlOverride: null,
    closeFilterPanelOnApply: false
}

export function defaultUndecodedViewData(): UndecodedViewData {
    return {
        columnOrder: null,
        hiddenColumns: [],
        rowsPerPage: null,
        syncOrderingToUserData: true,
        ordering: null,
        syncFilterStateToUserData: true,
        persistedFilterState: null,
        savedFilters: [],
        definitionRevision: BASELINE_DEFINITION_REVISION
    }
}

/* Decoders */

export const undecodedFilterValue: D.Decoder<UndecodedFilterValue> = (input) => {
    if (D.isRecord(input)) {
        if (input.type === 'empty') return Result.success({ type: 'empty' })
        if (input.type === 'value' && 'value' in input) return Result.success({ type: 'value', value: (input.value ?? null) as Json })
        if (input.type === 'legacy' && 'raw' in input) return Result.success({ type: 'legacy', raw: (input.raw ?? null) as Json })
    }
    // Anything else is a raw leaf value from before 2026-03-26.
    return Result.success({ type: 'legacy', raw: (input ?? null) as Json })
}

export const undecodedFilterFormState: D.Decoder<UndecodedFilterFormState> = D.taggedUnion<UndecodedFilterFormState>('type', {
    leaf: D.object({ type: D.map(D.string, () => 'leaf' as const), value: undecodedFilterValue }),
    and: D.object({ type: D.map(D.string, () => 'and' as const), children: D.array(D.lazy(() => undecodedFilterFormState)) }),
    or: D.object({ type: D.map(D.string, () => 'or' as const), children: D.array(D.lazy(() => undecodedFilterFormState)) }),
    not: D.object({ type: D.map(D.string, () => 'not' as const), child: D.lazy(() => undecodedFilterFormState) })
})

/** A filter whose state cannot be read is dropped, as if it was never stored. */
export const undecodedFilterState: D.Decoder<UndecodedFilterState> = D.recordDroppingInvalid(undecodedFilterFormState)

export const undecodedSavedFilter: D.Decoder<UndecodedSavedFilter> = D.object({
    id: D.string,
    name: D.string,
    view: D.withDefault(D.string, () => ''),
    createdAt: D.string,
    formatRevision: D.withDefault(D.string, () => ''),
    state: D.withDefault(undecodedFilterState, () => ({}))
})

export const dataOrdering: D.Decoder<DataOrdering> = D.object({
    field: D.string,
    direction: D.refine(D.string, isOrderDirection, 'an order direction')
})

/** Lenient field by field: an invalid field falls back to its default. */
export const undecodedViewData: D.Decoder<UndecodedViewData> = D.object({
    columnOrder: D.withDefault(D.nullable(D.array(D.string)), () => null),
    hiddenColumns: D.withDefault(D.array(D.string), () => []),
    rowsPerPage: D.withDefault(D.nullable(D.number), () => null),
    syncOrderingToUserData: D.withDefault(D.boolean, () => true),
    ordering: D.withDefault(D.nullable(dataOrdering), () => null),
    syncFilterStateToUserData: D.withDefault(D.boolean, () => true),
    persistedFilterState: D.withDefault(D.nullable(undecodedFilterState), () => null),
    savedFilters: D.withDefault(D.arrayDroppingInvalid(undecodedSavedFilter), () => []),
    definitionRevision: D.withDefault(D.number, () => BASELINE_DEFINITION_REVISION)
})

/** Lenient: an invalid preference falls back to its default. */
export const userPreferences: D.Decoder<UserPreferences> = D.withDefault(D.object({
    syncFilterStateToUrlOverride: D.withDefault(D.nullable(D.boolean), () => defaultUserPreferences.syncFilterStateToUrlOverride),
    closeFilterPanelOnApply: D.withDefault(D.boolean, () => defaultUserPreferences.closeFilterPanelOnApply)
}), () => defaultUserPreferences)

export const userDataWithUndecodedViews: D.Decoder<UserDataWithUndecodedViews> = D.object({
    preferences: userPreferences,
    views: D.withDefault(D.recordDroppingInvalid(undecodedViewData), () => ({})),
    revision: D.withDefault(D.number, () => 0),
    formatRevision: D.string
})

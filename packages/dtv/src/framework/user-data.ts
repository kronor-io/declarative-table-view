import { ViewId, type View } from './view';
import type { DataOrdering } from './data-ordering';

import { decodeSavedFilter, encodeSavedFilter, type SavedFilter } from './saved-filters';
import { FilterGroups, FilterId } from './filters';
import { decodeFilterState, encodeFilterState } from './filter-form-state';
import { FilterState, FormStateInitMode } from './state';
import { decode, isRecord, type DecodeIssue } from './decoder';
import { Result } from './result';
import {
    BASELINE_DEFINITION_REVISION,
    defaultUserPreferences,
    userDataWithUndecodedViews,
    type UndecodedViewData,
    type UserDataWithUndecodedViews,
    type UserPreferences
} from './user-data-undecoded';
import {
    applyUserDataMigrations,
    CURRENT_USERDATA_FORMAT_REVISION,
    INITIAL_USERDATA_FORMAT_REVISION,
    type UserDataJsonObject,
    type UserDataMigrationError
} from './user-data.migrations';
import {
    currentDefinitionRevision,
    mergeResets,
    migrateViewData,
    noResets,
    previousDefinitions,
    resetFiltersChangedSinceSnapshot,
    type MigrationResets,
    type ViewDataMigration,
    type ViewMigrationChain
} from './view-migrations';
import { projectionsEqual, projectView, type ViewProjection } from './view-projection';

export {
    INITIAL_USERDATA_FORMAT_REVISION,
    REVISION_2026_01_05,
    REVISION_2026_01_29,
    REVISION_2026_03_26,
    REVISION_2026_05_06,
    REVISION_2026_10_25
} from './user-data.migrations';
export { defaultUserPreferences, type UserPreferences } from './user-data-undecoded';

export interface ViewData {
    columnOrder: string[] | null;
    hiddenColumns: string[];
    rowsPerPage: number | null;
    syncOrderingToUserData: boolean;
    ordering: DataOrdering | null;
    syncFilterStateToUserData: boolean;
    persistedFilterState: FilterState | null;
    savedFilters: SavedFilter[];
}

/** A saved filter as JSON, as `onLoad` and `onSave` hand it over. */
export interface SavedFilterJson {
    id: string;
    name: string;
    view: string;
    state: unknown;
    createdAt: string | Date;
    formatRevision: string;
}

/** A view's user data as JSON, as `onLoad` and `onSave` hand it over. */
export interface ViewDataJson {
    columnOrder: string[] | null;
    hiddenColumns: string[];
    rowsPerPage: number | null;
    syncOrderingToUserData?: boolean;
    ordering?: DataOrdering | null;
    syncFilterStateToUserData?: boolean;
    persistedFilterState?: unknown;
    savedFilters: SavedFilterJson[];
    definitionRevision?: number;
}

/** User data as JSON, as `onLoad` and `onSave` hand it over. */
export interface UserDataJson {
    preferences: UserPreferences;
    views: Record<ViewId, ViewDataJson>;
    revision: number;
    formatRevision: string;
}

export interface UserData {
    preferences: UserPreferences;
    /** The views decoded against their definitions. */
    views: Record<ViewId, ViewData>;
    /**
     * Views kept as they were stored, and written back unchanged: views without a definition
     * here (other apps' or other tables' views share the user data), views written for a
     * newer revision of their definition, and views that failed to decode.
     */
    retainedViews: Record<ViewId, UndecodedViewData>;
    /**
     * Monotonic per-writer revision number, incremented on each persisted change.
     */
    revision: number;
    formatRevision: string;
}

export function defaultUserData(): UserData {
    return {
        preferences: defaultUserPreferences,
        views: {},
        retainedViews: {},
        revision: 0,
        formatRevision: CURRENT_USERDATA_FORMAT_REVISION
    }
}

export function defaultViewData(): ViewData {
    return {
        columnOrder: null,
        hiddenColumns: [],
        rowsPerPage: null,
        syncOrderingToUserData: true,
        ordering: null,
        syncFilterStateToUserData: true,
        persistedFilterState: null,
        savedFilters: []
    }
}

/**
 * What is stored before anything is: user data at the first format revision, so that the
 * user-data-level migrations bring in what earlier versions kept elsewhere.
 */
export function initialUserDataJson(): UserDataJsonObject {
    return {
        preferences: defaultUserPreferences,
        views: {},
        revision: 0,
        formatRevision: INITIAL_USERDATA_FORMAT_REVISION
    }
}

/* Stage 1: user data, up to the views */

export type UserDataDecodeError =
    /** Not user data at all. */
    | { kind: 'malformed'; issue: DecodeIssue }
    /** User data at a format revision this version cannot migrate from, e.g. a newer one. */
    | { kind: 'migrationFailed'; error: UserDataMigrationError }

export type UserDataDecoding = {
    data: UserDataWithUndecodedViews;
    /** Whether user-data-level migrations changed the data. */
    migrated: boolean;
    /** What the decoders worked around. */
    issues: DecodeIssue[];
}

/** Migrates stored user data to the current format and decodes it, up to the views. */
export function decodeUserData(json: unknown): Result<UserDataDecodeError, UserDataDecoding> {
    if (!isRecord(json)) {
        return Result.failure({ kind: 'malformed', issue: { path: '$', message: 'expected an object' } })
    }

    const migrated = applyUserDataMigrations(json)
    if (Result.isFailure(migrated)) {
        return Result.failure({ kind: 'migrationFailed', error: migrated.error })
    }

    const { result, issues } = decode(userDataWithUndecodedViews, migrated.value)
    return Result.bimap({
        mapFailure: (issue): UserDataDecodeError => ({ kind: 'malformed', issue }),
        mapSuccess: (data): UserDataDecoding => ({ data, migrated: migrated.value !== json, issues })
    }, result)
}

/* Stage 2: each view, against its definition */

/** Filters reset while decoding a view, because their stored state no longer fit the view. */
export type ViewResets = {
    viewId: ViewId;
    persistedFilterState: FilterId[];
    savedFilters: Array<{ name: string; filterIds: FilterId[] }>;
}

export type ViewDataDecoding = {
    viewData: ViewData;
    /** `null` when nothing was reset. */
    resets: ViewResets | null;
}

export function decodeViewData(viewId: ViewId, stored: UndecodedViewData, filterGroups: FilterGroups): ViewDataDecoding {
    // Empty filters are omitted on write (see `encodeFilterState`), so an id missing from
    // the persisted state means "this filter was unknown when the state was written", not
    // "the user cleared it". Hydrate the unknown ones from the schema so filters added to a
    // view after a user persisted their state keep their `initialValue`.
    const persisted = stored.persistedFilterState
        ? decodeFilterState(stored.persistedFilterState, filterGroups, FormStateInitMode.WithInitialValues)
        : null
    const savedFilters = stored.savedFilters.map(savedFilter => decodeSavedFilter(savedFilter, viewId, filterGroups))

    const resets: ViewResets = {
        viewId,
        persistedFilterState: persisted?.resetFilterIds ?? [],
        savedFilters: savedFilters
            .filter(decoded => decoded.resetFilterIds.length > 0)
            .map(decoded => ({ name: decoded.savedFilter.name, filterIds: decoded.resetFilterIds }))
    }

    return {
        viewData: {
            columnOrder: stored.columnOrder,
            hiddenColumns: stored.hiddenColumns,
            rowsPerPage: stored.rowsPerPage,
            syncOrderingToUserData: stored.syncOrderingToUserData,
            ordering: stored.ordering,
            syncFilterStateToUserData: stored.syncFilterStateToUserData,
            persistedFilterState: persisted?.state ?? null,
            savedFilters: savedFilters.map(decoded => decoded.savedFilter)
        },
        resets: resets.persistedFilterState.length > 0 || resets.savedFilters.length > 0 ? resets : null
    }
}

export function encodeViewData(viewData: ViewData, filterGroups: FilterGroups, definitionRevision: number = BASELINE_DEFINITION_REVISION): UndecodedViewData {
    return {
        columnOrder: viewData.columnOrder,
        hiddenColumns: viewData.hiddenColumns,
        rowsPerPage: viewData.rowsPerPage,
        syncOrderingToUserData: viewData.syncOrderingToUserData,
        ordering: viewData.ordering,
        syncFilterStateToUserData: viewData.syncFilterStateToUserData,
        persistedFilterState: viewData.persistedFilterState
            ? encodeFilterState(viewData.persistedFilterState, filterGroups)
            : null,
        savedFilters: viewData.savedFilters.map(savedFilter => encodeSavedFilter(savedFilter, filterGroups)),
        definitionRevision
    }
}

/** What a view's user data is migrated with: its definition's migrations, and the definition as it is now. */
export type ViewMigrationContext = {
    chain: ViewMigrationChain;
    /** The projection of the live definition, to compare with the chain's latest snapshot. */
    live: ViewProjection;
}

/**
 * The migration context of a view with migrations. Logs an error when the view's filters
 * changed since its latest snapshot: `dtv definitions snapshot` has not been run for the change.
 * Columns are not compared: an instance may lack a column its snapshot has (or have one
 * more), e.g. one shown only when the app passes row actions, and stored column ids of
 * absent columns are harmless; `dtv definitions check` compares them.
 */
export function viewMigrationContext(view: View): ViewMigrationContext | undefined {
    const chain = view.migrations
    if (chain === undefined) return undefined
    const live = projectView(view, chain.latest.definition, chain.latest.revision)
    if (!projectionsEqual(live.filters, chain.latest.filters)) {
        console.error(
            `View "${view.id}" differs from revision ${chain.latest.revision} of its definition "${chain.latest.definition}". ` +
            'Run `dtv definitions snapshot` to add a revision; until then, stored state of changed filters is reset.'
        )
    }
    return { chain, live }
}

export type ViewsDecoding = {
    userData: UserData;
    resets: ViewResets[];
    /** Whether view-level migrations changed any view's data. */
    migrated: boolean;
}

function withMigrationResets(viewId: ViewId, migration: MigrationResets, decoding: ViewResets | null): ViewResets | null {
    const merged = mergeResets(migration, decoding ?? noResets())
    return merged.persistedFilterState.length > 0 || merged.savedFilters.length > 0 ? { viewId, ...merged } : null
}

/**
 * Decodes the views this app defines; the others are retained. Views with migrations are
 * migrated to their definition's current revision first, and a view renamed between
 * snapshots takes over the data stored under its old id. A view stored for a newer
 * revision than this app knows, or that fails to decode, is retained too, so that what is
 * stored is not lost to this version's reading.
 */
export function decodeViews(
    data: UserDataWithUndecodedViews,
    filterGroupsByViewId: Record<ViewId, FilterGroups>,
    migrationsByViewId: Record<ViewId, ViewMigrationContext> = {}
): ViewsDecoding {
    const views: Record<ViewId, ViewData> = {}
    const retainedViews: Record<ViewId, UndecodedViewData> = {}
    const resets: ViewResets[] = []
    const handled = new Set<ViewId>()
    let migrated = false

    for (const [viewId, filterGroups] of Object.entries(filterGroupsByViewId)) {
        const context = migrationsByViewId[viewId]
        let stored = data.views[viewId]
        if (stored === undefined && context !== undefined && viewId === context.chain.latest.definition) {
            const previous = previousDefinitions(context.chain)
                .find(definition => data.views[definition] !== undefined && filterGroupsByViewId[definition] === undefined)
            if (previous !== undefined) {
                stored = data.views[previous]
                handled.add(previous)
                migrated = true
            }
        }
        if (stored === undefined) continue
        handled.add(viewId)

        if (stored.definitionRevision > currentDefinitionRevision(context?.chain)) {
            retainedViews[viewId] = stored
            continue
        }

        try {
            let migration: ViewDataMigration = { data: stored, resets: noResets() }
            if (context !== undefined) {
                const chained = migrateViewData(context.chain, stored)
                const stale = resetFiltersChangedSinceSnapshot(context.chain.latest, context.live, chained.data)
                migration = { data: stale.data, resets: mergeResets(chained.resets, stale.resets) }
                migrated ||= chained.data.definitionRevision !== stored.definitionRevision
            }
            const decoded = decodeViewData(viewId, migration.data, filterGroups)
            views[viewId] = decoded.viewData
            const viewResets = withMigrationResets(viewId, migration.resets, decoded.resets)
            if (viewResets) resets.push(viewResets)
        } catch (err) {
            console.error(`Failed to decode the user data of view "${viewId}"; it is kept as stored:`, err)
            retainedViews[viewId] = stored
        }
    }

    for (const [viewId, stored] of Object.entries(data.views)) {
        if (!handled.has(viewId)) retainedViews[viewId] = stored
    }

    return {
        userData: {
            preferences: data.preferences,
            views,
            retainedViews,
            revision: data.revision,
            formatRevision: data.formatRevision
        },
        resets,
        migrated
    }
}

export type UserDataRead = ViewsDecoding & {
    issues: DecodeIssue[];
}

/** Stored user data in memory: migrated, decoded up to the views, and the views migrated and decoded. */
export function readUserData(
    json: unknown,
    filterGroupsByViewId: Record<ViewId, FilterGroups>,
    migrationsByViewId: Record<ViewId, ViewMigrationContext> = {}
): Result<UserDataDecodeError, UserDataRead> {
    return Result.mapResult(
        ({ data, migrated, issues }) => {
            const decoded = decodeViews(data, filterGroupsByViewId, migrationsByViewId)
            return { ...decoded, migrated: migrated || decoded.migrated, issues }
        },
        decodeUserData(json)
    )
}

/**
 * User data as stored. Views are layered: `baseViews` (what is stored already), then the
 * retained views, then the decoded ones, encoded. A view written for a newer revision of its
 * definition is never replaced by what this version makes of it, and data stored under the
 * old id of a renamed view is dropped once the view wrote its own.
 */
export function encodeUserData(
    data: UserData,
    filterGroupsByViewId: Record<ViewId, FilterGroups>,
    baseViews: Record<ViewId, UndecodedViewData> = {},
    migrationsByViewId: Record<ViewId, ViewMigrationContext> = {}
): UserDataWithUndecodedViews {
    const views: Record<ViewId, UndecodedViewData> = { ...baseViews, ...data.retainedViews }

    for (const [viewId, viewData] of Object.entries(data.views)) {
        const filterGroups = filterGroupsByViewId[viewId]
        if (!filterGroups) continue
        const context = migrationsByViewId[viewId]
        const encoded = encodeViewData(viewData, filterGroups, currentDefinitionRevision(context?.chain))
        const existing = views[viewId]
        if (existing !== undefined && existing.definitionRevision > encoded.definitionRevision) continue
        views[viewId] = encoded
        if (context !== undefined && viewId === context.chain.latest.definition) {
            for (const previous of previousDefinitions(context.chain)) {
                if (filterGroupsByViewId[previous] === undefined) delete views[previous]
            }
        }
    }

    return {
        preferences: data.preferences,
        views,
        revision: data.revision,
        formatRevision: data.formatRevision
    }
}

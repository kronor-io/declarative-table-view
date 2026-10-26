import { isRecord } from './decoder';
import { SAVED_FILTERS_KEY } from './saved-filters';
import { BASELINE_DEFINITION_REVISION } from './user-data-undecoded';
import { failure, success, type Result } from './result'

/*
 * User-data-level migrations: changes to how dtv stores user data.
 *
 * Each step takes the stored JSON at one format revision to the next, JSON in and JSON out.
 * A step never needs a view definition: anything that does belongs to view-level
 * migrations, which run once the user data is decoded up to the views.
 */

export const INITIAL_USERDATA_FORMAT_REVISION = '1970-01-01T00:00:00.000Z'

export const REVISION_2026_01_05 = '2026-01-05T00:00:00.000Z'

export const REVISION_2026_01_29 = '2026-01-29T00:00:00.000Z'

export const REVISION_2026_03_26 = '2026-03-26T00:00:00.000Z'

export const REVISION_2026_05_06 = '2026-05-06T00:00:00.000Z'

export const REVISION_2026_10_25 = '2026-10-25T00:00:00.000Z'

export const SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY = 'dtvSavedFiltersMigratedToUserData';

type MigrationRevision = string;

/** Stored user data as JSON: only its top level is known to be an object. */
export type UserDataJsonObject = Record<string, unknown>

type MigrationStep = {
    fromRevision: MigrationRevision;
    toRevision: MigrationRevision;
    migrate: (json: UserDataJsonObject) => UserDataJsonObject;
};

/** The stored views, each with `change` applied; entries that are not objects are left alone. */
function mapViews(json: UserDataJsonObject, change: (view: Record<string, unknown>) => Record<string, unknown>): UserDataJsonObject {
    if (!isRecord(json.views)) return json
    return {
        ...json,
        views: Object.fromEntries(
            Object.entries(json.views).map(([viewId, view]) => [viewId, isRecord(view) ? change(view) : view])
        )
    }
}

const step_migrateSavedFilters: MigrationStep = {
    fromRevision: INITIAL_USERDATA_FORMAT_REVISION,
    toRevision: REVISION_2026_01_05,
    migrate: (json: UserDataJsonObject): UserDataJsonObject => {
        try {
            const alreadyMigrated = localStorage.getItem(SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY);
            if (alreadyMigrated) return json;

            const legacySavedFilters = localStorage.getItem(SAVED_FILTERS_KEY);
            if (!legacySavedFilters) return json;

            const parsed: unknown = JSON.parse(legacySavedFilters);
            if (!Array.isArray(parsed)) return json;

            // We parsed the legacy payload successfully; mark migration as done so we don't re-import
            // while the legacy key still exists.
            try {
                localStorage.setItem(SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY, 'true');
            } catch (err) {
                console.warn('Failed to persist saved-filters migration flag:', err);
            }

            const views: Record<string, unknown> = isRecord(json.views) ? { ...json.views } : {}
            const savedFiltersOf = (view: unknown): unknown[] =>
                isRecord(view) && Array.isArray(view.savedFilters) ? view.savedFilters : []

            const existingFilterIds = new Set<string>(
                Object.values(views)
                    .flatMap(savedFiltersOf)
                    .flatMap(savedFilter => isRecord(savedFilter) && typeof savedFilter.id === 'string' ? [savedFilter.id] : [])
            )

            // Group by view and append to views[viewId].savedFilters. Entries for views this
            // app does not define are kept too: some other app may.
            for (const item of parsed as Array<unknown>) {
                if (!isRecord(item)) continue;

                const viewId = item.view
                if (!viewId || typeof viewId !== 'string') continue;

                const id = item.id
                if (!id || typeof id !== 'string') continue;

                const name = item.name
                if (!name || typeof name !== 'string') continue;

                const createdAt = item.createdAt
                if (!createdAt || typeof createdAt !== 'string') continue;

                const formatRevision = item.formatRevision
                if (!formatRevision || typeof formatRevision !== 'string') continue;

                const filterId: string = existingFilterIds.has(id) ? crypto.randomUUID() : id
                existingFilterIds.add(filterId)

                const view = views[viewId]
                views[viewId] = {
                    ...(isRecord(view) ? view : {}),
                    savedFilters: [
                        ...savedFiltersOf(view),
                        { id: filterId, name, view: viewId, state: item.state, createdAt, formatRevision }
                    ]
                }
            }

            return { ...json, views }
        } catch (err) {
            console.error('Failed migrating legacy saved filters into user data:', err);
            return json;
        }
    }
}

const step_addPreference_syncFilterStateToUrlOverride: MigrationStep = {
    fromRevision: REVISION_2026_01_05,
    toRevision: REVISION_2026_01_29,
    migrate: (json: UserDataJsonObject): UserDataJsonObject => ({
        ...json,
        preferences: {
            ...(isRecord(json.preferences) ? json.preferences : {}),
            syncFilterStateToUrlOverride: null
        }
    })
}

const step_migrateSavedFilterStateToLeafAdt: MigrationStep = {
    fromRevision: REVISION_2026_01_29,
    toRevision: REVISION_2026_03_26,
    // Leaves from before this revision hold raw values. Which `FilterValue` a raw value
    // stands for depends on the filter's control, so it cannot be decided here: such
    // leaves decode as `legacy` and are resolved when their view is decoded.
    migrate: (json: UserDataJsonObject): UserDataJsonObject => json
}

const step_addViewPreference_syncFilterStateToUserData: MigrationStep = {
    fromRevision: REVISION_2026_03_26,
    toRevision: REVISION_2026_05_06,
    // `syncFilterStateToUserData` is absent from older views and decodes to its default.
    migrate: (json: UserDataJsonObject): UserDataJsonObject =>
        mapViews(json, view => ({ ...view, persistedFilterState: null }))
}

const step_addViewDefinitionRevision: MigrationStep = {
    fromRevision: REVISION_2026_05_06,
    toRevision: REVISION_2026_10_25,
    // Everything stored so far was written without knowing the view definition's revision.
    // Moving to a new format revision also makes older dtv versions leave the data alone,
    // instead of writing it back with view data from a definition they predate.
    migrate: (json: UserDataJsonObject): UserDataJsonObject =>
        mapViews(json, view => ({ ...view, definitionRevision: BASELINE_DEFINITION_REVISION }))
}

const MIGRATIONS: MigrationStep[] = [
    step_migrateSavedFilters,
    step_addPreference_syncFilterStateToUrlOverride,
    step_migrateSavedFilterStateToLeafAdt,
    step_addViewPreference_syncFilterStateToUserData,
    step_addViewDefinitionRevision
];

export const CURRENT_USERDATA_FORMAT_REVISION = MIGRATIONS[MIGRATIONS.length - 1].toRevision;

export type UserDataMigrationError =
    | {
        kind: 'outOfOrder'
        currentRevision: string
        expectedRevision: string
    }
    | {
        kind: 'unknownRevision'
        currentRevision: string
        latestRevision: string
        knownFromRevisions: string[]
    }
    | {
        kind: 'stepFailed'
        toRevision: string
        cause: unknown
    }
    | {
        kind: 'didNotReachLatest'
        currentRevision: string
        expectedRevision: string
    }

export function userDataMigrationErrorToMessage(err: UserDataMigrationError): string {
    switch (err.kind) {
        case 'outOfOrder':
            return `User-data migration out of order. Current revision: ${err.currentRevision}, expected: ${err.expectedRevision}`
        case 'unknownRevision':
            return [
                'User-data migration cannot proceed from an unknown revision.',
                `Current revision: ${err.currentRevision}`,
                `Latest revision: ${err.latestRevision}`,
                `Known starting revisions: ${err.knownFromRevisions.join(', ')}`
            ].join(' ')
        case 'stepFailed':
            return `User-data migration to revision ${err.toRevision} failed: ${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
        case 'didNotReachLatest':
            return `User-data migration did not reach latest revision. Current: ${err.currentRevision} Expected: ${err.expectedRevision}`
    }
}

const formatRevisionOf = (json: UserDataJsonObject): string => String(json.formatRevision)

function applyUserDataMigrationsWithSteps(
    json: UserDataJsonObject,
    migrations: MigrationStep[]
): Result<UserDataMigrationError, UserDataJsonObject> {
    // Latest revision is a single invariant constant.
    // Even in tests, custom step lists should end at CURRENT_USERDATA_FORMAT_REVISION.
    if (formatRevisionOf(json) === CURRENT_USERDATA_FORMAT_REVISION) {
        return success(json)
    }

    let nextJson = json

    // We may start from an already-migrated payload.
    // When new steps are appended, stored user-data can have a formatRevision matching
    // the toRevision of a prior step; we must start from the first step whose fromRevision
    // matches the current revision.
    const startIndex = migrations.findIndex(step => step.fromRevision === formatRevisionOf(nextJson))
    if (startIndex === -1) {
        return failure({
            kind: 'unknownRevision',
            currentRevision: formatRevisionOf(nextJson),
            latestRevision: CURRENT_USERDATA_FORMAT_REVISION,
            knownFromRevisions: migrations.map(s => s.fromRevision)
        })
    }

    for (let i = startIndex; i < migrations.length; i++) {
        const step = migrations[i]
        const currentRevision = formatRevisionOf(nextJson)

        if (step.fromRevision !== currentRevision) {
            return failure({
                kind: 'outOfOrder',
                currentRevision,
                expectedRevision: step.fromRevision
            })
        }

        try {
            nextJson = { ...step.migrate(nextJson), formatRevision: step.toRevision }
        } catch (err) {
            return failure({
                kind: 'stepFailed',
                toRevision: step.toRevision,
                cause: err
            })
        }
    }

    if (formatRevisionOf(nextJson) !== CURRENT_USERDATA_FORMAT_REVISION) {
        return failure({
            kind: 'didNotReachLatest',
            currentRevision: formatRevisionOf(nextJson),
            expectedRevision: CURRENT_USERDATA_FORMAT_REVISION
        })
    }

    return success(nextJson)
}

/** @internal Exported for unit testing the migration engine with custom step lists. */
export function __applyUserDataMigrationsWithStepsForTest(
    json: UserDataJsonObject,
    migrations: MigrationStep[]
): Result<UserDataMigrationError, UserDataJsonObject> {
    return applyUserDataMigrationsWithSteps(json, migrations)
}

export function applyUserDataMigrations(json: UserDataJsonObject): Result<UserDataMigrationError, UserDataJsonObject> {
    return applyUserDataMigrationsWithSteps(json, MIGRATIONS)
}

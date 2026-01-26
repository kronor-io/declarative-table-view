import { FilterSchemasAndGroups } from './filters';
import { fromSavedFilterJson, SAVED_FILTERS_KEY, type SavedFilter, type SavedFilterJson } from './saved-filters';
import { defaultViewData, INITIAL_USERDATA_FORMAT_REVISION, REVISION_2026_01_05, ViewData, type UserData } from './user-data';
import { ViewId } from './view';
import { failure, success, type Result } from './result'

export const SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY = 'dtvSavedFiltersMigratedToUserData';

type MigrationRevision = string;

type MigrationStep = {
    fromRevision: MigrationRevision;
    toRevision: MigrationRevision;
    migrate: (data: UserData, context: MigrationContext) => UserData;
};

type MigrationContext = {
    filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups>;
};

const step_migrateSavedFilters: MigrationStep = {
    fromRevision: INITIAL_USERDATA_FORMAT_REVISION,
    toRevision: REVISION_2026_01_05,
    migrate: (userData: UserData, context: MigrationContext): UserData => {
        try {
            const alreadyMigrated = localStorage.getItem(SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY);
            if (alreadyMigrated) return userData;

            const legacySavedFilters = localStorage.getItem(SAVED_FILTERS_KEY);
            if (!legacySavedFilters) return userData;

            const parsed: unknown = JSON.parse(legacySavedFilters);
            if (!Array.isArray(parsed)) return userData;

            // We parsed the legacy payload successfully; mark migration as done so we don't re-import
            // while the legacy key still exists.
            try {
                localStorage.setItem(SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY, 'true');
            } catch (err) {
                console.warn('Failed to persist saved-filters migration flag:', err);
            }

            const migratedSavedFiltersByView: Record<ViewId, Array<SavedFilter>> = {}

            const existingFilterIds = new Set<string>(
                Object.values(userData.views)
                    .flatMap(view => view.savedFilters.map(savedFilter => savedFilter.id))
            )

            // Group by view and merge into data.views[viewId].savedFilters (raw form)
            for (const item of parsed as Array<unknown>) {
                if (!item || typeof item !== 'object') continue;
                const rawSavedFilterJson = item as Record<string, unknown>;

                const viewId = rawSavedFilterJson.view
                if (!viewId || typeof viewId !== 'string') continue;

                const id = rawSavedFilterJson.id
                if (!id || typeof id !== 'string') continue;

                const filterId: string = existingFilterIds.has(id) ? crypto.randomUUID() : id

                const name = rawSavedFilterJson.name
                if (!name || typeof name !== 'string') continue;

                const createdAt = rawSavedFilterJson.createdAt
                if (!createdAt || typeof createdAt !== 'string') continue;

                const formatRevision = rawSavedFilterJson.formatRevision
                if (!formatRevision || typeof formatRevision !== 'string') continue;

                const schema = context.filterSchemasByViewId[viewId]
                if (!schema) {
                    console.warn('Missing filter schema for view while migrating saved filters:', viewId);
                    continue;
                }

                const savedFilterJson: SavedFilterJson = {
                    id: filterId,
                    name,
                    view: viewId,
                    state: rawSavedFilterJson.state,
                    createdAt,
                    formatRevision
                }

                const savedFilter = fromSavedFilterJson(savedFilterJson, schema)
                existingFilterIds.add(savedFilter.id)

                const prevViewSavedFilters = migratedSavedFiltersByView[viewId] ?? []
                migratedSavedFiltersByView[viewId] = [...prevViewSavedFilters, savedFilter]
            }

            // Merge into userData.views
            const nextUserData: UserData = { ...userData }
            for (const [viewId, viewSavedFilters] of Object.entries(migratedSavedFiltersByView)) {
                const prevViewData = nextUserData.views[viewId] ?? defaultViewData()
                const nextViewData: ViewData = {
                    ...prevViewData,
                    savedFilters: [...prevViewData.savedFilters, ...viewSavedFilters]
                }
                nextUserData.views[viewId] = nextViewData
            }

            return nextUserData
        } catch (err) {
            console.error('Failed migrating legacy saved filters into user data:', err);
            return userData;
        }
    }
}

const MIGRATIONS: MigrationStep[] = [step_migrateSavedFilters];

export const CURRENT_USERDATA_FORMAT_REVISION = MIGRATIONS[MIGRATIONS.length - 1].toRevision;

export type UserDataMigrationError =
    | {
        kind: 'outOfOrder'
        currentRevision: string
        expectedRevision: string
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
        case 'stepFailed':
            return `User-data migration to revision ${err.toRevision} failed: ${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
        case 'didNotReachLatest':
            return `User-data migration did not reach latest revision. Current: ${err.currentRevision} Expected: ${err.expectedRevision}`
    }
}

export function applyUserDataMigrations(userData: UserData, context: MigrationContext): Result<UserDataMigrationError, UserData> {
    if (userData.formatRevision === CURRENT_USERDATA_FORMAT_REVISION) {
        return success(userData)
    }

    let nextUserData = userData

    for (const step of MIGRATIONS) {
        const currentRevision = nextUserData.formatRevision

        if (step.fromRevision !== currentRevision) {
            return failure({
                kind: 'outOfOrder',
                currentRevision,
                expectedRevision: step.fromRevision
            })
        }

        try {
            nextUserData = step.migrate(nextUserData, context)
            nextUserData.formatRevision = step.toRevision
        } catch (err) {
            return failure({
                kind: 'stepFailed',
                toRevision: step.toRevision,
                cause: err
            })
        }
    }

    if (nextUserData.formatRevision !== CURRENT_USERDATA_FORMAT_REVISION) {
        return failure({
            kind: 'didNotReachLatest',
            currentRevision: nextUserData.formatRevision,
            expectedRevision: CURRENT_USERDATA_FORMAT_REVISION
        })
    }

    return success(nextUserData)
}

import {
    decodeUserData,
    latestFilterId,
    migrateFilterState,
    type UndecodedFilterState,
    type ViewMigrationChain,
} from '@kronor/dtv';

/*
 * What the server derives with DTV's own code, which runs only in TypeScript: filters at the
 * current revision of their definition, and users' stored data decoded. Everything else the
 * store does in SQL.
 */

type UndecodedFilterFormState = UndecodedFilterState[string];

/** The definitions the host has, by name. */
export type Definitions = ReadonlyMap<string, ViewMigrationChain>;

/** A `filtersApplied` event, as the server sends it. */
export type AppliedFilters = {
    eventId: string;
    definition: string;
    definitionRevision: number;
    filters: UndecodedFilterState;
};

/** A filter set in a `filtersApplied`, by its id at the definition's current revision. */
export type FilterUse = {
    eventId: string;
    filterId: string;
    /** The filter was dropped from the definition since: `filterId` is its id then. */
    removed: boolean;
};

/** Whether a filter's state holds a value: filters left empty are not stored, but a group can be. */
export function isSet(state: UndecodedFilterFormState): boolean {
    switch (state.type) {
        case 'leaf':
            return state.value.type !== 'empty';
        case 'and':
        case 'or':
            return state.children.some(isSet);
        case 'not':
            return isSet(state.child);
    }
}

/** The filters set at the current revision. A filter of an unknown definition keeps its id. */
export function setFilters(definitions: Definitions, definition: string, revision: number, state: UndecodedFilterState): Array<{ filterId: string; removed: boolean }> {
    const chain = definitions.get(definition);
    if (chain === undefined) {
        return Object.entries(state).filter(([, s]) => isSet(s)).map(([filterId]) => ({ filterId, removed: false }));
    }
    const migrated = migrateFilterState(chain, revision, state);
    return Object.entries(state).flatMap(([filterId, s]): Array<{ filterId: string; removed: boolean }> => {
        if (!isSet(s)) return [];
        const latest = latestFilterId(chain, revision, filterId);
        if (latest === null) return [{ filterId, removed: true }];
        // A migration can reset what was stored for it
        const now = migrated[latest];
        return now !== undefined && isSet(now) ? [{ filterId: latest, removed: false }] : [];
    });
}

export function filterUses(definitions: Definitions, events: readonly AppliedFilters[]): FilterUse[] {
    return events.flatMap(event =>
        setFilters(definitions, event.definition, event.definitionRevision, event.filters ?? {})
            .map(use => ({ eventId: event.eventId, ...use })));
}

/** A user's stored data, as the server sends it. */
export type StoredUserData = {
    userId: string;
    revision: string;
    data: unknown;
};

/** What a user keeps for one view. */
export type UserViewData = {
    userId: string;
    revision: string;
    viewId: string;
    /** `null` when the view's definition is not known. */
    definition: string | null;
    /** The revision the data was written for. */
    definitionRevision: number;
    hiddenColumns: string[];
    columnOrder: string[] | null;
    rowsPerPage: number | null;
    ordering: { field: string; direction: string } | null;
    keepsOrdering: boolean;
    keepsFilters: boolean;
    /** The filters set in the state kept between visits, at the current revision. */
    keptFilters: string[];
    savedFilters: Array<{ id: string; name: string; createdAt: string; filters: string[] }>;
};

export type UserViewDataResult = {
    views: UserViewData[];
    /** Users whose data could not be read, and why. */
    unreadable: Array<{ userId: string; revision: string; error: string }>;
};

/**
 * Users' stored data, one row per view. A view's definition is its own id, or the one events
 * of the view name (`viewDefinitions`): views built per record share a definition.
 */
export function userViewData(definitions: Definitions, viewDefinitions: Readonly<Record<string, string>>, users: readonly StoredUserData[]): UserViewDataResult {
    const result: UserViewDataResult = { views: [], unreadable: [] };
    for (const user of users) {
        const decoded = decodeUserData(user.data);
        if (decoded.tag === 'failure') {
            const error = decoded.error.kind === 'malformed'
                ? `${decoded.error.issue.path}: ${decoded.error.issue.message}`
                : JSON.stringify(decoded.error.error);
            result.unreadable.push({ userId: user.userId, revision: user.revision, error });
            continue;
        }
        for (const [viewId, view] of Object.entries(decoded.value.data.views)) {
            const definition = definitions.has(viewId) ? viewId : viewDefinitions[viewId] ?? null;
            const filters = (state: UndecodedFilterState) =>
                definition === null
                    ? setFilters(definitions, viewId, view.definitionRevision, state).map(f => f.filterId)
                    : setFilters(definitions, definition, view.definitionRevision, state).filter(f => !f.removed).map(f => f.filterId);
            result.views.push({
                userId: user.userId,
                revision: user.revision,
                viewId,
                definition,
                definitionRevision: view.definitionRevision,
                hiddenColumns: view.hiddenColumns,
                columnOrder: view.columnOrder,
                rowsPerPage: view.rowsPerPage,
                ordering: view.ordering,
                keepsOrdering: view.syncOrderingToUserData,
                keepsFilters: view.syncFilterStateToUserData,
                keptFilters: view.persistedFilterState === null ? [] : filters(view.persistedFilterState),
                savedFilters: view.savedFilters.map(saved => ({
                    id: saved.id,
                    name: saved.name,
                    createdAt: saved.createdAt,
                    filters: filters(saved.state),
                })),
            });
        }
    }
    return result;
}

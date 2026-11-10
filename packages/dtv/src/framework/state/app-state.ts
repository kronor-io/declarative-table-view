import type { DTVAnalyticsError, DTVAnalyticsEventPayload, DTVAnalyticsSpan, FetchReason, FiltersAppliedTrigger, ReportedEvent } from '../analytics';
import type { ViewDefinition } from '../analytics-emitter';
import type { FetchDataResult } from '../data';
import { dataOrderingsEqual, type DataOrdering } from '../data-ordering';
import { valuesEqual } from '../equality';
import { createFilterDisplayState, type FilterDisplayState } from '../filter-display-state';
import { encodeFilterState } from '../filter-form-state';
import type { FilterGroups } from '../filters';
import { isSnapshotDiffEmpty, type SnapshotDiff } from '../view-migrations';
import type { ViewId, ViewQuery } from '../view';
import { createDefaultFilterState, filterStatesEqual, type FilterState } from './filter-state';
import {
    currentPageQuery, currentQuery, nextPageCursor, nextRequestId, noRequestId, receiveRows, shownPage,
    type Page, type Query, type RequestId, type TableState
} from './table';

/*
 * The state of a table view, and its transitions.
 *
 * `updateAppState` is pure. Its effects leave it as data: the request the table waits on is
 * read off the state with `pendingRequest`, and writes to user data are returned as
 * `Command`s, and so are the analytics events transitions report (`track`) and the toolbar
 * actions to run. `useAppState` runs both and feeds what comes back in as messages, in the
 * order they are sent: applying the draft right after changing it applies the changed draft,
 * whatever renders happen in between.
 */

/** What user data holds for the selected view. */
export interface ViewUserData {
    /** The initial load has completed. Until then, the remote copy may bring a persisted state. */
    readonly ready: boolean;
    readonly syncFilterState: boolean;
    readonly persistedFilterState: FilterState | null;
    readonly rowsPerPage: number | null;
    readonly syncOrdering: boolean;
    readonly ordering: DataOrdering | null;
}

/** A panel shown below the menu bar; one at a time. */
export type Panel = 'filters' | 'savedFilters' | 'preferences';

export interface AppState {
    readonly selectedViewId: ViewId;
    readonly table: TableState;
    /** The draft filter state: the one being edited. Applying it starts a request; editing it does not. */
    readonly filterState: FilterState;
    /** The search through the selected view's filters, and which of their groups are expanded. */
    readonly searchQuery: string;
    readonly filterDisplayState: FilterDisplayState;
    /** The user data of the selected view; `null` until it arrives. */
    readonly userData: ViewUserData | null;
    /** The ordering each view's next query starts with. Remembered across view switches. */
    readonly orderingByViewId: Readonly<Record<ViewId, DataOrdering | null>>;
    /** The rows per page the next query starts with. Kept across view switches. */
    readonly rowsPerPage: number;
    readonly lastRequestId: RequestId;
    readonly activePanel: Panel | null;
    readonly showAIAssistant: boolean;
    readonly showPopout: boolean;
    /** The rows the user selected, as the table hands them out; empty when row selection is off. */
    readonly selectedRows: readonly unknown[];
    /** The toolbar actions running, by id, with how many rows were selected when each started. */
    readonly runningActions: ReadonlyMap<string, { readonly selectedRows: number }>;
    /** The AI filter assistant filled the draft since filters were last applied. */
    readonly aiAssistedDraft: boolean;
    /** Where the filter state the table opened with came from, until the view settles. */
    readonly initialFilterStateSource: AppStateInit['initialFilterStateSource'] | null;
}

/** What `updateAppState` reads but does not own. */
export interface AppStateEnv {
    readonly filterGroups: (viewId: ViewId) => FilterGroups;
    /** The rows per page a user may pick; empty allows any. */
    readonly rowsPerPageOptions: readonly number[];
    /** The fields a view's rows can be ordered by. */
    readonly orderableFields: (viewId: ViewId) => readonly string[];
    /** The definition a view's analytics events are reported for. */
    readonly definition: (viewId: ViewId) => ViewDefinition;
    /** How a view's filters differ from its latest definition snapshot; `null` without migrations. */
    readonly snapshotDiff: (viewId: ViewId) => SnapshotDiff | null;
    /** What a view's rows are read with now; `null` for a view the table does not have. */
    readonly viewQuery: (viewId: ViewId) => ViewQuery | null;
    /** The toolbar action with this id; `null` for an id no action has. */
    readonly action: (id: string) => { readonly disabled: boolean } | null;
}

/** What applies filters by a message. The table opening with filters is told by the state. */
export type ApplyTrigger = Extract<FiltersAppliedTrigger, 'submit' | 'reset' | 'pillRemoved' | 'savedFilter' | 'api'>;

/** A saved filter, as applying it is reported. */
export type SavedFilterRef = { readonly id: string; readonly name: string };

export type Msg =
    /** User data of `viewId` changed: written here, by another tab, or loaded. */
    | { readonly tag: 'userDataChanged'; readonly viewId: ViewId; readonly userData: ViewUserData }
    | { readonly tag: 'viewSelected'; readonly viewId: ViewId }
    /**
     * The draft changed: edited, unless `by` says it was filled by the AI filter assistant or
     * replaced by a saved filter.
     */
    | { readonly tag: 'draftChanged'; readonly filters: FilterState; readonly by?: 'aiAssistant' | 'savedFilter' }
    /** Apply the draft as it is when this message is handled. */
    | { readonly tag: 'draftApplied'; readonly trigger: Extract<ApplyTrigger, 'submit' | 'reset' | 'api'> }
    /** Apply `filters`, leaving the draft as it is. */
    | { readonly tag: 'filtersApplied'; readonly filters: FilterState; readonly trigger: ApplyTrigger; readonly savedFilter?: SavedFilterRef }
    | { readonly tag: 'searchQueryChanged'; readonly searchQuery: string }
    | { readonly tag: 'filterGroupExpandedChanged'; readonly groupName: string; readonly expanded: boolean }
    | { readonly tag: 'orderingChanged'; readonly ordering: DataOrdering | null }
    | { readonly tag: 'rowsPerPageChanged'; readonly rowsPerPage: number }
    | { readonly tag: 'nextPageRequested' }
    | { readonly tag: 'previousPageRequested' }
    /** Refetch the current page, e.g. after a mutation elsewhere. Hydrating, the view fetches once it settles. */
    | { readonly tag: 'refreshRequested' }
    /**
     * The environment changed: the host may have changed what the selected view's rows are read
     * with. Hydrating, the view fetches with it once it settles.
     */
    | { readonly tag: 'envChanged' }
    | { readonly tag: 'rowsArrived'; readonly requestId: RequestId; readonly rows: FetchDataResult }
    /** Show `panel`, or hide it when it is the one shown. */
    | { readonly tag: 'panelToggled'; readonly panel: Panel }
    | { readonly tag: 'filterPanelShown'; readonly shown: boolean }
    | { readonly tag: 'aiAssistantToggled' }
    | { readonly tag: 'popoutShown'; readonly shown: boolean }
    | { readonly tag: 'rowsSelected'; readonly rows: readonly unknown[] }
    /** Run the toolbar action with this id: its button was clicked, or the host asked (`DTVAPI.runAction`). */
    | { readonly tag: 'actionRequested'; readonly id: string }
    /** The run of an action ended: its promise settled, or it threw. */
    | {
        readonly tag: 'actionEnded';
        readonly id: string;
        readonly span: DTVAnalyticsSpan;
        readonly outcome: 'succeeded' | 'failed';
        readonly error?: DTVAnalyticsError;
    }
    /** A component or the user data reported an analytics event, of the selected view. */
    | { readonly tag: 'reported'; readonly event: ReportedEvent };

/** Reports the latest of the events of `key` once `ms` passed without another one. */
export type Debounce = { readonly key: string; readonly ms: number };

export type Command =
    | { readonly tag: 'persistFilterState'; readonly viewId: ViewId; readonly filters: FilterState }
    | { readonly tag: 'persistRowsPerPage'; readonly viewId: ViewId; readonly rowsPerPage: number }
    | { readonly tag: 'persistOrdering'; readonly viewId: ViewId; readonly ordering: DataOrdering | null }
    /** Tell the host that no row is selected any more: the table cleared the selection itself. */
    | { readonly tag: 'notifyRowSelectionCleared' }
    /** Call the `onClick` of the action with this id, and send `actionEnded` once it ends. */
    | { readonly tag: 'runAction'; readonly id: string }
    /** Warn the host that it asked to run an action no action has the id of. */
    | { readonly tag: 'warnUnknownAction'; readonly id: string }
    /** Report `event` as an analytics event of `viewId`. */
    | { readonly tag: 'track'; readonly viewId: ViewId; readonly event: DTVAnalyticsEventPayload; readonly debounce?: Debounce }
    /** Drop the event of `key` waiting for a pause. */
    | { readonly tag: 'cancelTrack'; readonly key: string };

export interface AppStateInit {
    readonly viewId: ViewId;
    readonly rowsPerPage: number;
    /** A filter state the page was opened with, e.g. a shared link. It wins over a persisted one. */
    readonly initialFilterState?: FilterState;
    /** Where `initialFilterState` came from, and the revision of the view's definition it was written for. */
    readonly initialFilterStateSource?: { readonly trigger: 'link' | 'url'; readonly definitionRevision: number };
    /** The table is the popout of another one. */
    readonly popout?: boolean;
}

/** A table that waits for the user data of its view: it starts with a `userDataChanged`. */
export function initAppState(env: AppStateEnv, init: AppStateInit): AppState {
    const initialFilterState = init.initialFilterState ?? null;
    const filterGroups = env.filterGroups(init.viewId);
    return {
        selectedViewId: init.viewId,
        table: { tag: 'hydrating', initialFilterState },
        filterState: initialFilterState ?? createDefaultFilterState(filterGroups),
        searchQuery: '',
        filterDisplayState: createFilterDisplayState(filterGroups, ''),
        userData: null,
        orderingByViewId: {},
        rowsPerPage: init.rowsPerPage,
        lastRequestId: noRequestId,
        activePanel: null,
        showAIAssistant: false,
        showPopout: false,
        selectedRows: [],
        runningActions: new Map(),
        aiAssistedDraft: false,
        initialFilterStateSource: init.initialFilterState === undefined ? null : init.initialFilterStateSource ?? null
    };
}

/** What a table does as it mounts, before any message: it reports that it did. */
export function initialCommands(env: AppStateEnv, init: AppStateInit): Command[] {
    return [track(init.viewId, { type: 'viewMounted', popout: init.popout === true }), ...changedFiltersEvents(env, init.viewId)];
}

export function updateAppState(env: AppStateEnv, state: AppState, msg: Msg): [AppState, Command[]] {
    switch (msg.tag) {
        case 'userDataChanged': {
            // Sent for a view this table no longer shows, or with nothing new
            if (msg.viewId !== state.selectedViewId) return [state, []];
            if (state.userData !== null && viewUserDataEqual(state.userData, msg.userData)) return [state, []];

            // The persisted rows per page applies when it changes. A re-read that still holds
            // the previous one, while the user's newer choice is being written, must not undo it.
            const persisted = persistedRowsPerPage(env, msg.userData);
            const rowsPerPageChanged = state.userData === null || state.userData.rowsPerPage !== msg.userData.rowsPerPage;
            // The persisted ordering likewise
            const ordering = persistedOrdering(env, state, msg.userData);
            const next: AppState = {
                ...state,
                userData: msg.userData,
                rowsPerPage: persisted !== null && rowsPerPageChanged ? persisted : state.rowsPerPage,
                orderingByViewId: ordering === undefined
                    ? state.orderingByViewId
                    : { ...state.orderingByViewId, [state.selectedViewId]: ordering }
            };

            // Persisting the ordering was just turned on: the one on screen is the one to keep
            const current = next.orderingByViewId[next.selectedViewId] ?? null;
            const commands: Command[] = state.userData !== null && !state.userData.syncOrdering && msg.userData.syncOrdering
                && current !== null && !dataOrderingsEqual(current, msg.userData.ordering)
                ? [{ tag: 'persistOrdering', viewId: next.selectedViewId, ordering: current }]
                : [];

            if (state.table.tag === 'hydrating') {
                const start = state.table.initialFilterState !== null
                    ? { filters: state.table.initialFilterState, trigger: state.initialFilterStateSource?.trigger ?? 'link' }
                    : hydratedFilterState(env, next.selectedViewId, msg.userData);
                if (start === null) return [next, commands];
                return [
                    settle(env, { ...next, initialFilterStateSource: null }, start.filters),
                    [...commands, filtersAppliedEvent(env, next, start.filters, start.trigger)]
                ];
            }

            const query = currentQuery(state.table);
            if (query === null) return [next, commands];

            // Settled: a persisted filter state that arrives now comes from another tab, and
            // the filters on screen must not change under the user. Only rows per page and the
            // ordering apply.
            if (next.rowsPerPage === query.rowsPerPage && dataOrderingsEqual(current, query.ordering)) return [next, commands];
            return [startRequest(next, queryFrom(env, next, query.filters), shownPage(state.table), 'userData'), commands];
        }

        case 'viewSelected': {
            if (msg.viewId === state.selectedViewId) return [state, []];

            const filterGroups = env.filterGroups(msg.viewId);
            // The previous view's rows have other columns: nothing stays on screen, nor
            // selected. Its filters start collapsed; the search carries over.
            return [{
                ...state,
                selectedViewId: msg.viewId,
                userData: null,
                table: { tag: 'hydrating', initialFilterState: null },
                filterState: createDefaultFilterState(filterGroups),
                filterDisplayState: createFilterDisplayState(filterGroups, state.searchQuery),
                selectedRows: [],
                aiAssistedDraft: false,
                initialFilterStateSource: null
            }, [
                track(msg.viewId, { type: 'viewSelected', previousViewId: state.selectedViewId }),
                ...changedFiltersEvents(env, msg.viewId),
                ...rowSelectionCleared(state)
            ]];
        }

        case 'draftChanged':
            return [{
                ...state,
                filterState: msg.filters,
                // An edit keeps what the assistant filled in; a saved filter replaces all of it
                aiAssistedDraft: msg.by === 'aiAssistant' || (msg.by !== 'savedFilter' && state.aiAssistedDraft)
            }, []];

        case 'draftApplied':
            return updateAppState(env, state, { tag: 'filtersApplied', filters: state.filterState, trigger: msg.trigger });

        case 'filtersApplied': {
            // Until the user data arrives, whether to persist is not known: the user's filters
            // apply, and stay unpersisted
            const { userData } = state;
            const persist = userData !== null && userData.syncFilterState
                && !(userData.persistedFilterState !== null && filterStatesEqual(userData.persistedFilterState, msg.filters));

            const applied: AppState = { ...state, aiAssistedDraft: false, initialFilterStateSource: null };
            const next: AppState = persist
                ? { ...applied, userData: { ...userData, persistedFilterState: msg.filters } }
                : applied;
            const commands: Command[] = [
                filtersAppliedEvent(env, state, msg.filters, msg.trigger, msg.savedFilter),
                ...(persist ? [{ tag: 'persistFilterState', viewId: state.selectedViewId, filters: msg.filters } as const] : [])
            ];

            // Applying filters while hydrating settles the view with them: the user's choice wins
            return [startRequest(next, queryFrom(env, next, msg.filters), shownPage(state.table), 'filters'), commands];
        }

        case 'searchQueryChanged': {
            const query = msg.searchQuery.trim();
            const next: AppState = {
                ...state,
                searchQuery: msg.searchQuery,
                filterDisplayState: createFilterDisplayState(env.filterGroups(state.selectedViewId), msg.searchQuery),
                // Searching shows the filters it finds
                activePanel: msg.searchQuery ? 'filters' : state.activePanel
            };
            return [next, [
                ...panelEvents(state, next),
                // The search the user settled on, once typing pauses; none when it was cleared before
                query === ''
                    ? { tag: 'cancelTrack', key: filterSearchKey }
                    : { ...track(state.selectedViewId, { type: 'filterSearch', query }), debounce: { key: filterSearchKey, ms: 1000 } }
            ]];
        }

        case 'filterGroupExpandedChanged':
            return [{ ...state, filterDisplayState: setFilterGroupExpanded(state.filterDisplayState, msg.groupName, msg.expanded) }, []];

        case 'orderingChanged': {
            const current = state.orderingByViewId[state.selectedViewId] ?? null;
            if (dataOrderingsEqual(current, msg.ordering)) return [state, []];

            const next: AppState = {
                ...state,
                orderingByViewId: { ...state.orderingByViewId, [state.selectedViewId]: msg.ordering }
            };
            // Until the user data arrives, whether to persist is not known
            const commands: Command[] = [
                track(state.selectedViewId, { type: 'orderingChanged', ordering: msg.ordering }),
                ...(state.userData !== null && state.userData.syncOrdering
                    ? [{ tag: 'persistOrdering', viewId: state.selectedViewId, ordering: msg.ordering } as const]
                    : [])
            ];
            return [restartFromFirstPage(env, next, state, 'ordering'), commands];
        }

        case 'rowsPerPageChanged': {
            if (msg.rowsPerPage === state.rowsPerPage) return [state, []];

            const next: AppState = { ...state, rowsPerPage: msg.rowsPerPage };
            return [
                restartFromFirstPage(env, next, state, 'rowsPerPage'),
                [
                    track(state.selectedViewId, { type: 'rowsPerPageChanged', rowsPerPage: msg.rowsPerPage }),
                    { tag: 'persistRowsPerPage', viewId: state.selectedViewId, rowsPerPage: msg.rowsPerPage }
                ]
            ];
        }

        case 'nextPageRequested': {
            // Where the next page starts is only known from rows that have arrived
            if (state.table.tag !== 'loaded') return [state, []];

            const { page } = state.table;
            const cursor = nextPageCursor(page);
            if (cursor === null) return [state, []];

            return [startPaging(state, { ...page.query, cursors: [...page.query.cursors, cursor] }, page, 'nextPage'), []];
        }

        case 'previousPageRequested': {
            const query = currentPageQuery(state.table);
            if (query === null || query.cursors.length === 0) return [state, []];

            const previous: Query = { ...query, cursors: query.cursors.slice(0, -1) };
            const shown = shownPage(state.table);
            // Going back from the rows on screen moves to another page of them
            return [
                shown?.query === query ? startPaging(state, previous, shown, 'previousPage') : startRequest(state, previous, shown, 'previousPage'),
                []
            ];
        }

        case 'refreshRequested': {
            const query = currentPageQuery(state.table);
            if (query === null) return [state, []];

            return [startRequest(state, query, shownPage(state.table), 'refresh'), []];
        }

        case 'envChanged': {
            const query = currentQuery(state.table);
            if (query === null || valuesEqual(query.viewQuery, env.viewQuery(state.selectedViewId))) return [state, []];

            // The rows on screen, and a request still on its way, are of another view query, a
            // record the page showed before, say: the first page is asked for again, with the
            // filters applied, and none of those rows stays selected
            const next: AppState = { ...state, selectedRows: [] };
            return [restartFromFirstPage(env, next, state, 'viewQuery'), rowSelectionCleared(state)];
        }

        case 'rowsArrived': {
            const table = receiveRows(state.table, msg.requestId, msg.rows);
            return [table === state.table ? state : { ...state, table }, []];
        }

        case 'panelToggled': {
            const next: AppState = { ...state, activePanel: state.activePanel === msg.panel ? null : msg.panel };
            return [next, panelEvents(state, next)];
        }

        case 'filterPanelShown': {
            if (msg.shown === (state.activePanel === 'filters')) return [state, []];
            // Hiding the filters leaves another panel shown as it is
            const next: AppState = { ...state, activePanel: msg.shown ? 'filters' : null };
            return [next, panelEvents(state, next)];
        }

        case 'aiAssistantToggled':
            return [
                { ...state, showAIAssistant: !state.showAIAssistant },
                [track(state.selectedViewId, { type: 'panelShown', panel: 'aiAssistant', shown: !state.showAIAssistant })]
            ];

        case 'popoutShown':
            if (msg.shown === state.showPopout) return [state, []];
            return [
                { ...state, showPopout: msg.shown },
                [track(state.selectedViewId, { type: 'panelShown', panel: 'popout', shown: msg.shown })]
            ];

        case 'rowsSelected':
            if (msg.rows.length === 0 && state.selectedRows.length === 0) return [state, []];
            return [{ ...state, selectedRows: msg.rows }, []];

        case 'actionRequested': {
            const action = env.action(msg.id);
            if (action === null) return [state, [{ tag: 'warnUnknownAction', id: msg.id }]];
            // As its button: a disabled action cannot be clicked, and a running one is not run again
            if (action.disabled || state.runningActions.has(msg.id)) return [state, []];

            return [
                { ...state, runningActions: new Map(state.runningActions).set(msg.id, { selectedRows: state.selectedRows.length }) },
                [{ tag: 'runAction', id: msg.id }]
            ];
        }

        case 'actionEnded': {
            const running = state.runningActions.get(msg.id);
            if (running === undefined) return [state, []];

            const runningActions = new Map(state.runningActions);
            runningActions.delete(msg.id);
            return [{ ...state, runningActions }, [track(state.selectedViewId, {
                type: 'action',
                ...msg.span,
                action: msg.id,
                selectedRows: running.selectedRows,
                outcome: msg.outcome,
                ...(msg.error === undefined ? {} : { error: msg.error })
            })]];
        }

        case 'reported':
            return [state, [track(state.selectedViewId, msg.event)]];

        default:
            return absurd(msg);
    }
}

/**
 * The filter state a view starts from, or `null` while it cannot be known yet: syncing is on
 * and nothing is persisted locally, but the initial load may still bring a remote copy.
 */
function hydratedFilterState(
    env: AppStateEnv,
    viewId: ViewId,
    userData: ViewUserData
): { filters: FilterState; trigger: 'restored' | 'initial' } | null {
    const initial = () => ({ filters: createDefaultFilterState(env.filterGroups(viewId)), trigger: 'initial' as const });
    if (!userData.syncFilterState) return initial();
    if (userData.persistedFilterState) return { filters: userData.persistedFilterState, trigger: 'restored' };
    return userData.ready ? initial() : null;
}

/** Tells the host the rows `state` has selected are not any more, when there are any. */
function rowSelectionCleared(state: AppState): Command[] {
    return state.selectedRows.length > 0 ? [{ tag: 'notifyRowSelectionCleared' }] : [];
}

function track(viewId: ViewId, event: DTVAnalyticsEventPayload): Command & { tag: 'track' } {
    return { tag: 'track', viewId, event };
}

const filterSearchKey = 'filterSearch';

/** Reports the panel hidden and the one shown, one at a time as they are. */
function panelEvents(previous: AppState, next: AppState): Command[] {
    if (previous.activePanel === next.activePanel) return [];
    return [
        ...(previous.activePanel === null ? [] : [track(previous.selectedViewId, { type: 'panelShown', panel: previous.activePanel, shown: false })]),
        ...(next.activePanel === null ? [] : [track(next.selectedViewId, { type: 'panelShown', panel: next.activePanel, shown: true })])
    ];
}

/** Reports that a view's filters changed without a snapshot, when they did. */
function changedFiltersEvents(env: AppStateEnv, viewId: ViewId): Command[] {
    const diff = env.snapshotDiff(viewId);
    return diff === null || isSnapshotDiffEmpty(diff) ? [] : [track(viewId, { type: 'filtersChangedSinceSnapshot', ...diff })];
}

/** Reports that `state`'s view applies `filters`. */
function filtersAppliedEvent(
    env: AppStateEnv,
    state: AppState,
    filters: FilterState,
    trigger: FiltersAppliedTrigger,
    savedFilter?: SavedFilterRef
): Command {
    const viewId = state.selectedViewId;
    return track(viewId, {
        type: 'filtersApplied',
        trigger,
        filters: encodeFilterState(filters, env.filterGroups(viewId)),
        ...(savedFilter === undefined ? {} : { savedFilter }),
        // Only the draft can have been filled by the assistant
        aiAssisted: (trigger === 'submit' || trigger === 'api') && state.aiAssistedDraft,
        ...((trigger === 'link' || trigger === 'url') && state.initialFilterStateSource
            ? { link: { definitionRevision: state.initialFilterStateSource.definitionRevision } }
            : {})
    });
}

function viewUserDataEqual(left: ViewUserData, right: ViewUserData): boolean {
    return left.ready === right.ready
        && left.syncFilterState === right.syncFilterState
        && left.persistedFilterState === right.persistedFilterState
        && left.rowsPerPage === right.rowsPerPage
        && left.syncOrdering === right.syncOrdering
        && dataOrderingsEqual(left.ordering, right.ordering);
}

function persistedRowsPerPage(env: AppStateEnv, userData: ViewUserData): number | null {
    const { rowsPerPage } = userData;
    if (rowsPerPage === null) return null;
    if (env.rowsPerPageOptions.length > 0 && !env.rowsPerPageOptions.includes(rowsPerPage)) return null;
    return rowsPerPage;
}

/**
 * The persisted ordering when it is to apply, `undefined` when not. Like rows per page, it
 * applies when it changes: a re-read that still holds the previous one, while the user's
 * newer choice is being written, must not undo it. An ordering by a field the view no
 * longer orders by does not apply. Nothing persisted, the first time the user data arrives,
 * leaves the ordering the view had before as it is.
 */
function persistedOrdering(env: AppStateEnv, state: AppState, userData: ViewUserData): DataOrdering | null | undefined {
    if (!userData.syncOrdering) return undefined;
    const { ordering } = userData;
    if (state.userData === null ? ordering === null : dataOrderingsEqual(state.userData.ordering, ordering)) return undefined;
    if (ordering !== null && !env.orderableFields(state.selectedViewId).includes(ordering.field)) return undefined;
    return ordering;
}

/**
 * Starts the view from `filters`: the first page of them, with the draft showing them too,
 * unless the user edited the draft while the view was hydrating.
 */
function settle(env: AppStateEnv, state: AppState, filters: FilterState): AppState {
    const draftEdited = !filterStatesEqual(state.filterState, createDefaultFilterState(env.filterGroups(state.selectedViewId)));
    const filterState = draftEdited ? state.filterState : filters;
    return startRequest({ ...state, filterState }, queryFrom(env, state, filters), null, 'filters');
}

/** A first-page query for the selected view as it is now, with the state's ordering and rows per page. */
function queryFrom(env: AppStateEnv, state: AppState, filters: FilterState): Query {
    return {
        viewId: state.selectedViewId,
        viewQuery: env.viewQuery(state.selectedViewId),
        filters,
        ordering: state.orderingByViewId[state.selectedViewId] ?? null,
        rowsPerPage: state.rowsPerPage,
        cursors: []
    };
}

/** Asks for the first page again, with `next`'s settings and the filters `previous` showed. */
function restartFromFirstPage(env: AppStateEnv, next: AppState, previous: AppState, reason: FetchReason): AppState {
    const query = currentQuery(previous.table);
    // Still hydrating: the settings apply once the view settles
    if (query === null) return next;
    return startRequest(next, queryFrom(env, next, query.filters), shownPage(previous.table), reason);
}

function startRequest(state: AppState, query: Query, shown: Page | null, reason: FetchReason): AppState {
    const id = nextRequestId(state.lastRequestId);
    return { ...state, lastRequestId: id, table: { tag: 'loading', request: { id, query, reason }, shown } };
}

/** Moves to `query`, another page of the `shown` rows. */
function startPaging(state: AppState, query: Query, shown: Page, reason: FetchReason): AppState {
    const id = nextRequestId(state.lastRequestId);
    return { ...state, lastRequestId: id, table: { tag: 'paging', request: { id, query, reason }, shown } };
}

function setFilterGroupExpanded(displayState: FilterDisplayState, groupName: string, expanded: boolean): FilterDisplayState {
    const next = new Set(displayState.expandedGroups);
    if (expanded) {
        next.add(groupName);
    } else {
        next.delete(groupName);
    }

    const expandedGroups = Array.from(next);
    return displayState.type === 'searchResults'
        ? { type: 'searchResults', filterGroups: displayState.filterGroups, expandedGroups }
        : { type: 'all', expandedGroups };
}

function absurd(value: never): never {
    throw new Error(`Unhandled message: ${JSON.stringify(value)}`);
}

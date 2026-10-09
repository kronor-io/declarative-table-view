import type { FetchDataResult } from '../data';
import { dataOrderingsEqual, type DataOrdering } from '../data-ordering';
import { createFilterDisplayState, type FilterDisplayState } from '../filter-display-state';
import type { FilterGroups } from '../filters';
import type { ViewId } from '../view';
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
 * `Command`s. `useAppState` runs both and feeds what comes back in as messages, in the order
 * they are sent: applying the draft right after changing it applies the changed draft,
 * whatever renders happen in between.
 */

/** What user data holds for the selected view. */
export interface ViewUserData {
    /** The initial load has completed. Until then, the remote copy may bring a persisted state. */
    readonly ready: boolean;
    readonly syncFilterState: boolean;
    readonly persistedFilterState: FilterState | null;
    readonly rowsPerPage: number | null;
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
    /** The rows the user selected, flattened; empty when row selection is off. */
    readonly selectedRows: readonly unknown[];
}

/** What `updateAppState` reads but does not own. */
export interface AppStateEnv {
    readonly filterGroups: (viewId: ViewId) => FilterGroups;
    /** The rows per page a user may pick; empty allows any. */
    readonly rowsPerPageOptions: readonly number[];
}

export type Msg =
    /** User data of `viewId` changed: written here, by another tab, or loaded. */
    | { readonly tag: 'userDataChanged'; readonly viewId: ViewId; readonly userData: ViewUserData }
    | { readonly tag: 'viewSelected'; readonly viewId: ViewId }
    | { readonly tag: 'draftChanged'; readonly filters: FilterState }
    /** Apply the draft as it is when this message is handled. */
    | { readonly tag: 'draftApplied' }
    /** Apply `filters`, leaving the draft as it is. */
    | { readonly tag: 'filtersApplied'; readonly filters: FilterState }
    | { readonly tag: 'searchQueryChanged'; readonly searchQuery: string }
    | { readonly tag: 'filterGroupExpandedChanged'; readonly groupName: string; readonly expanded: boolean }
    | { readonly tag: 'orderingChanged'; readonly ordering: DataOrdering | null }
    | { readonly tag: 'rowsPerPageChanged'; readonly rowsPerPage: number }
    | { readonly tag: 'nextPageRequested' }
    | { readonly tag: 'previousPageRequested' }
    /** Refetch the current page, e.g. after a mutation elsewhere. Hydrating, the view fetches once it settles. */
    | { readonly tag: 'refreshRequested' }
    | { readonly tag: 'rowsArrived'; readonly requestId: RequestId; readonly rows: FetchDataResult }
    /** Show `panel`, or hide it when it is the one shown. */
    | { readonly tag: 'panelToggled'; readonly panel: Panel }
    | { readonly tag: 'filterPanelShown'; readonly shown: boolean }
    | { readonly tag: 'aiAssistantToggled' }
    | { readonly tag: 'popoutShown'; readonly shown: boolean }
    | { readonly tag: 'rowsSelected'; readonly rows: readonly unknown[] };

export type Command =
    | { readonly tag: 'persistFilterState'; readonly viewId: ViewId; readonly filters: FilterState }
    | { readonly tag: 'persistRowsPerPage'; readonly viewId: ViewId; readonly rowsPerPage: number };

export interface AppStateInit {
    readonly viewId: ViewId;
    readonly rowsPerPage: number;
    /** A filter state the page was opened with, e.g. a shared link. It wins over a persisted one. */
    readonly initialFilterState?: FilterState;
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
        selectedRows: []
    };
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
            const next: AppState = {
                ...state,
                userData: msg.userData,
                rowsPerPage: persisted !== null && rowsPerPageChanged ? persisted : state.rowsPerPage
            };

            if (state.table.tag === 'hydrating') {
                const filters = state.table.initialFilterState ?? hydratedFilterState(env, next.selectedViewId, msg.userData);
                return [filters ? settle(env, next, filters) : next, []];
            }

            const query = currentQuery(state.table);
            if (query === null) return [next, []];

            // Settled: a persisted filter state that arrives now comes from another tab, and
            // the filters on screen must not change under the user. Only rows per page apply.
            if (next.rowsPerPage === query.rowsPerPage) return [next, []];
            return [startRequest(next, queryFrom(next, query.filters), shownPage(state.table)), []];
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
                selectedRows: []
            }, []];
        }

        case 'draftChanged':
            return [{ ...state, filterState: msg.filters }, []];

        case 'draftApplied':
            return updateAppState(env, state, { tag: 'filtersApplied', filters: state.filterState });

        case 'filtersApplied': {
            // Until the user data arrives, whether to persist is not known: the user's filters
            // apply, and stay unpersisted
            const { userData } = state;
            const persist = userData !== null && userData.syncFilterState
                && !(userData.persistedFilterState !== null && filterStatesEqual(userData.persistedFilterState, msg.filters));

            const next: AppState = persist
                ? { ...state, userData: { ...userData, persistedFilterState: msg.filters } }
                : state;
            const commands: Command[] = persist
                ? [{ tag: 'persistFilterState', viewId: state.selectedViewId, filters: msg.filters }]
                : [];

            // Applying filters while hydrating settles the view with them: the user's choice wins
            return [startRequest(next, queryFrom(next, msg.filters), shownPage(state.table)), commands];
        }

        case 'searchQueryChanged':
            return [{
                ...state,
                searchQuery: msg.searchQuery,
                filterDisplayState: createFilterDisplayState(env.filterGroups(state.selectedViewId), msg.searchQuery),
                // Searching shows the filters it finds
                activePanel: msg.searchQuery ? 'filters' : state.activePanel
            }, []];

        case 'filterGroupExpandedChanged':
            return [{ ...state, filterDisplayState: setFilterGroupExpanded(state.filterDisplayState, msg.groupName, msg.expanded) }, []];

        case 'orderingChanged': {
            const current = state.orderingByViewId[state.selectedViewId] ?? null;
            if (dataOrderingsEqual(current, msg.ordering)) return [state, []];

            const next: AppState = {
                ...state,
                orderingByViewId: { ...state.orderingByViewId, [state.selectedViewId]: msg.ordering }
            };
            return [restartFromFirstPage(next, state), []];
        }

        case 'rowsPerPageChanged': {
            if (msg.rowsPerPage === state.rowsPerPage) return [state, []];

            const next: AppState = { ...state, rowsPerPage: msg.rowsPerPage };
            return [
                restartFromFirstPage(next, state),
                [{ tag: 'persistRowsPerPage', viewId: state.selectedViewId, rowsPerPage: msg.rowsPerPage }]
            ];
        }

        case 'nextPageRequested': {
            // Where the next page starts is only known from rows that have arrived
            if (state.table.tag !== 'loaded') return [state, []];

            const { page } = state.table;
            const cursor = nextPageCursor(page);
            if (cursor === null) return [state, []];

            return [startPaging(state, { ...page.query, cursors: [...page.query.cursors, cursor] }, page), []];
        }

        case 'previousPageRequested': {
            const query = currentPageQuery(state.table);
            if (query === null || query.cursors.length === 0) return [state, []];

            const previous: Query = { ...query, cursors: query.cursors.slice(0, -1) };
            const shown = shownPage(state.table);
            // Going back from the rows on screen moves to another page of them
            return [shown?.query === query ? startPaging(state, previous, shown) : startRequest(state, previous, shown), []];
        }

        case 'refreshRequested': {
            const query = currentPageQuery(state.table);
            if (query === null) return [state, []];

            return [startRequest(state, query, shownPage(state.table)), []];
        }

        case 'rowsArrived': {
            const table = receiveRows(state.table, msg.requestId, msg.rows);
            return [table === state.table ? state : { ...state, table }, []];
        }

        case 'panelToggled':
            return [{ ...state, activePanel: state.activePanel === msg.panel ? null : msg.panel }, []];

        case 'filterPanelShown': {
            if (msg.shown) return [{ ...state, activePanel: 'filters' }, []];
            // Hiding the filters leaves another panel shown as it is
            return [state.activePanel === 'filters' ? { ...state, activePanel: null } : state, []];
        }

        case 'aiAssistantToggled':
            return [{ ...state, showAIAssistant: !state.showAIAssistant }, []];

        case 'popoutShown':
            return [{ ...state, showPopout: msg.shown }, []];

        case 'rowsSelected':
            if (msg.rows.length === 0 && state.selectedRows.length === 0) return [state, []];
            return [{ ...state, selectedRows: msg.rows }, []];

        default:
            return absurd(msg);
    }
}

/**
 * The filter state a view starts from, or `null` while it cannot be known yet: syncing is on
 * and nothing is persisted locally, but the initial load may still bring a remote copy.
 */
function hydratedFilterState(env: AppStateEnv, viewId: ViewId, userData: ViewUserData): FilterState | null {
    if (!userData.syncFilterState) return createDefaultFilterState(env.filterGroups(viewId));
    if (userData.persistedFilterState) return userData.persistedFilterState;
    return userData.ready ? createDefaultFilterState(env.filterGroups(viewId)) : null;
}

function viewUserDataEqual(left: ViewUserData, right: ViewUserData): boolean {
    return left.ready === right.ready
        && left.syncFilterState === right.syncFilterState
        && left.persistedFilterState === right.persistedFilterState
        && left.rowsPerPage === right.rowsPerPage;
}

function persistedRowsPerPage(env: AppStateEnv, userData: ViewUserData): number | null {
    const { rowsPerPage } = userData;
    if (rowsPerPage === null) return null;
    if (env.rowsPerPageOptions.length > 0 && !env.rowsPerPageOptions.includes(rowsPerPage)) return null;
    return rowsPerPage;
}

/**
 * Starts the view from `filters`: the first page of them, with the draft showing them too,
 * unless the user edited the draft while the view was hydrating.
 */
function settle(env: AppStateEnv, state: AppState, filters: FilterState): AppState {
    const draftEdited = !filterStatesEqual(state.filterState, createDefaultFilterState(env.filterGroups(state.selectedViewId)));
    const filterState = draftEdited ? state.filterState : filters;
    return startRequest({ ...state, filterState }, queryFrom(state, filters), null);
}

/** A first-page query for the selected view, with the state's ordering and rows per page. */
function queryFrom(state: AppState, filters: FilterState): Query {
    return {
        viewId: state.selectedViewId,
        filters,
        ordering: state.orderingByViewId[state.selectedViewId] ?? null,
        rowsPerPage: state.rowsPerPage,
        cursors: []
    };
}

/** Asks for the first page again, with `next`'s settings and the filters `previous` showed. */
function restartFromFirstPage(next: AppState, previous: AppState): AppState {
    const query = currentQuery(previous.table);
    // Still hydrating: the settings apply once the view settles
    if (query === null) return next;
    return startRequest(next, queryFrom(next, query.filters), shownPage(previous.table));
}

function startRequest(state: AppState, query: Query, shown: Page | null): AppState {
    const id = nextRequestId(state.lastRequestId);
    return { ...state, lastRequestId: id, table: { tag: 'loading', request: { id, query }, shown } };
}

/** Moves to `query`, another page of the `shown` rows. */
function startPaging(state: AppState, query: Query, shown: Page): AppState {
    const id = nextRequestId(state.lastRequestId);
    return { ...state, lastRequestId: id, table: { tag: 'paging', request: { id, query }, shown } };
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

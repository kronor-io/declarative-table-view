import type { FetchDataResult, PaginationCursor } from '../data';
import type { DataOrdering } from '../data-ordering';
import type { ViewId } from '../view';
import type { FilterState } from './filter-state';

/*
 * The table's state machine: which rows it asks for, and which answer it shows.
 *
 * The types carry the rules, so code that breaks them does not compile:
 * - A table that is still hydrating has no query, so there is nothing a request could be
 *   built from.
 * - Rows are kept with the query they answer. The page number, filters and ordering shown
 *   with them are read from that query, so they cannot disagree with the rows.
 * - Request ids are minted here alone, and rows are accepted only for the request the table
 *   waits on. A superseded response has nowhere to go.
 */

declare const requestIdBrand: unique symbol;

/** Identifies a request. Minted by this module alone, so rows can only answer one it started. */
export type RequestId = number & { readonly [requestIdBrand]: true };

/** The row a following page starts after. */
export type Cursor = NonNullable<PaginationCursor>;

/** Everything the rows of a request depend on. */
export interface Query {
    readonly viewId: ViewId;
    readonly filters: FilterState;
    readonly ordering: DataOrdering | null;
    readonly rowsPerPage: number;
    /** Where each page after the first starts. Its length is the page index. */
    readonly cursors: readonly Cursor[];
}

/** A request for the rows of `query`. */
export interface DataRequest {
    readonly id: RequestId;
    readonly query: Query;
}

/** Rows and the query they answer. */
export interface Page {
    readonly query: Query;
    readonly rows: FetchDataResult;
}

export type TableState =
    /**
     * The filter state to start from is not known yet: the view's user data has not arrived,
     * or a persisted state may still come with the initial load. `initialFilterState`, from a
     * shared link say, wins over a persisted one once the user data is there.
     */
    | { readonly tag: 'hydrating'; readonly initialFilterState: FilterState | null }
    /** Waiting for `request`. `shown` stays on screen, under the loading overlay, meanwhile. */
    | { readonly tag: 'loading'; readonly request: DataRequest; readonly shown: Page | null }
    /**
     * Moving to another page of the rows on screen. Until it arrives the user is still on
     * `shown`: refreshing, or going back, is relative to it.
     */
    | { readonly tag: 'paging'; readonly request: DataRequest; readonly shown: Page }
    | { readonly tag: 'loaded'; readonly page: Page };

/** Pagination as actions see it (see `ActionAPI.getPaginationState`). */
export interface PaginationState {
    page: number;
    cursors: PaginationCursor[];
    rowsPerPage: number;
}

/** No rows: what a table shows before any arrive, or when a request fails. */
export const noRows: FetchDataResult = { rows: [], flattenedRows: [] };

/** The id before the first request. Not exported from the state module: only it mints ids. */
export const noRequestId = 0 as RequestId;

/** The id of the request after the one `last` identifies. */
export function nextRequestId(last: RequestId): RequestId {
    return (last + 1) as RequestId;
}

/** Rows arrived for `requestId`: the table shows them if it waits on that request. */
export function receiveRows(table: TableState, requestId: RequestId, rows: FetchDataResult): TableState {
    const request = pendingRequest(table);
    if (request?.id !== requestId) return table;
    return { tag: 'loaded', page: { query: request.query, rows } };
}

/** The request to run. Running another one, or none, means the previous one is superseded. */
export function pendingRequest(table: TableState): DataRequest | null {
    switch (table.tag) {
        case 'hydrating': return null;
        case 'loading': return table.request;
        case 'paging': return table.request;
        case 'loaded': return null;
    }
}

/** The rows on screen and the query they answer. */
export function shownPage(table: TableState): Page | null {
    switch (table.tag) {
        case 'hydrating': return null;
        case 'loading': return table.shown;
        case 'paging': return table.shown;
        case 'loaded': return table.page;
    }
}

/** The query the table last asked for, answered or not. */
export function currentQuery(table: TableState): Query | null {
    switch (table.tag) {
        case 'hydrating': return null;
        case 'loading': return table.request.query;
        case 'paging': return table.request.query;
        case 'loaded': return table.page.query;
    }
}

/**
 * The query of the page the user is on: the one being loaded, unless that is only a move to
 * another page of the rows on screen.
 */
export function currentPageQuery(table: TableState): Query | null {
    switch (table.tag) {
        case 'hydrating': return null;
        case 'loading': return table.request.query;
        case 'paging': return table.shown.query;
        case 'loaded': return table.page.query;
    }
}

/** The filters of the query the table last asked for; `null` while hydrating. */
export function appliedFilterState(table: TableState): FilterState | null {
    return currentQuery(table)?.filters ?? null;
}

export function isLoading(table: TableState): boolean {
    return table.tag !== 'loaded';
}

export function hasNextPage(table: TableState): boolean {
    return table.tag === 'loaded' && nextPageCursor(table.page) !== null;
}

export function hasPreviousPage(table: TableState): boolean {
    return (currentPageQuery(table)?.cursors.length ?? 0) > 0;
}

/** The pagination of the rows on screen; `rowsPerPage` while there are none. */
export function paginationState(table: TableState, rowsPerPage: number): PaginationState {
    const query = shownPage(table)?.query;
    return {
        page: query?.cursors.length ?? 0,
        cursors: [...(query?.cursors ?? [])],
        rowsPerPage: query?.rowsPerPage ?? rowsPerPage
    };
}

/** A full page may have one after it, starting after its last row. */
export function nextPageCursor(page: Page): Cursor | null {
    const { rows } = page.rows;
    if (rows.length === 0 || rows.length < page.query.rowsPerPage) return null;
    return rows[rows.length - 1] ?? null;
}

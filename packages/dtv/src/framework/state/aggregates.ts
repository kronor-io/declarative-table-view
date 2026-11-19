import type { AggregatesResult } from '../aggregates-data';
import type { AggregateName, AggregateState, AggregateStates } from '../aggregates';
import { valuesEqual } from '../equality';
import type { ViewId, ViewQuery } from '../view';
import { filterStatesEqual, type FilterState } from './filter-state';
import type { Query, RequestId } from './table';

/*
 * The aggregates of the selected view: which ones the table asks for, and which answer it has.
 *
 * Aggregates depend on less than the rows do: the view, what the host has it read with, and
 * the applied filters, not the page, the ordering or rows per page. Paging and sorting keep
 * them; applying other filters asks for them again. An answer is kept with the query it
 * answers, and accepted only for the request the table waits on, as rows are.
 */

/** Everything a view's aggregates depend on. */
export interface AggregatesQuery {
    readonly viewId: ViewId;
    readonly viewQuery: ViewQuery | null;
    readonly filters: FilterState;
}

export interface AggregatesRequest {
    readonly id: RequestId;
    readonly query: AggregatesQuery;
}

export type AggregatesState =
    /** The view has no aggregates, or there is no query yet: the table is hydrating. */
    | { readonly tag: 'none' }
    | { readonly tag: 'loading'; readonly request: AggregatesRequest }
    | { readonly tag: 'loaded'; readonly query: AggregatesQuery; readonly result: AggregatesResult }
    | { readonly tag: 'failed'; readonly query: AggregatesQuery };

export const noAggregates: AggregatesState = { tag: 'none' };

/** What the aggregates of the rows `query` asks for depend on. */
export function aggregatesQueryOf(query: Query): AggregatesQuery {
    return { viewId: query.viewId, viewQuery: query.viewQuery, filters: query.filters };
}

export function aggregatesQueriesEqual(left: AggregatesQuery, right: AggregatesQuery): boolean {
    return left.viewId === right.viewId
        && valuesEqual(left.viewQuery, right.viewQuery)
        && filterStatesEqual(left.filters, right.filters);
}

/** The query the aggregates answer, or are asked for; `null` without any. */
export function aggregatesQuery(state: AggregatesState): AggregatesQuery | null {
    switch (state.tag) {
        case 'none': return null;
        case 'loading': return state.request.query;
        case 'loaded': return state.query;
        case 'failed': return state.query;
    }
}

/** The request to run. Running another one, or none, means the previous one is superseded. */
export function pendingAggregatesRequest(state: AggregatesState): AggregatesRequest | null {
    return state.tag === 'loading' ? state.request : null;
}

/** The aggregates arrived for `requestId`, or failed (`null`): kept if the table waits on that request. */
export function receiveAggregates(state: AggregatesState, requestId: RequestId, result: AggregatesResult | null): AggregatesState {
    if (state.tag !== 'loading' || state.request.id !== requestId) return state;
    return result === null
        ? { tag: 'failed', query: state.request.query }
        : { tag: 'loaded', query: state.request.query, result };
}

/** The state of each aggregate of `names`, as its readers get it. */
export function aggregateStates(state: AggregatesState, names: readonly AggregateName[]): AggregateStates {
    const stateOf = (name: AggregateName): AggregateState => {
        switch (state.tag) {
            case 'none':
            case 'loading':
                return { state: 'loading' };
            case 'failed':
                return { state: 'error' };
            case 'loaded': {
                const data = state.result[name];
                return data === undefined ? { state: 'error' } : { state: 'ready', data };
            }
        }
    };
    return Object.fromEntries(names.map(name => [name, stateOf(name)]));
}

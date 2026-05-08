import { useCallback, useState } from "react";
import { FilterFormState } from "./filter-form-state";
import * as FilterValue from "./filterValue";
import { FilterGroups, FilterId, FilterExpr } from "./filters";
import { View, ViewId } from "./view";
import { FetchDataResult } from "./data";
import { createFilterDisplayState, FilterDisplayState } from "./filter-display-state";
import { getAllFilters } from "./view";

export type FilterState = Map<FilterId, FilterFormState>;

export enum FormStateInitMode {
    WithInitialValues = 'withInitialValues',
    Empty = 'empty'
}

// Helper to build form state from FilterExpr
export function buildInitialFormState(expr: FilterExpr, mode: FormStateInitMode = FormStateInitMode.WithInitialValues): FilterFormState {
    if (expr.type === 'and' || expr.type === 'or') {
        return {
            type: expr.type,
            children: expr.filters.map(child => buildInitialFormState(child, mode))
        };
    } else if (expr.type === 'not') {
        return {
            type: 'not',
            child: buildInitialFormState(expr.filter, mode)
        };
    } else {
        // Leaf node – build initial value depending on control type
        if (expr.value.type === 'customOperator') {
            // For customOperator we store an object: { operator, value }
            // Operator defaults to first provided operator value
            const operator = expr.value.operators[0]?.value;

            // Determine base initial value (NOT already wrapped):
            // - Empty mode => ''
            // - Top-level initialValue if present
            // - Nested valueControl.initialValue if present
            const value = mode === FormStateInitMode.Empty
                ? FilterValue.empty
                : FilterValue.alt([
                    FilterValue.fromJS(expr.value.initialValue),
                    FilterValue.fromJS(expr.value.valueControl.initialValue)
                ])
            return {
                type: 'leaf',
                value: FilterValue.value({ operator, value })
            };
        }

        const value = mode === FormStateInitMode.Empty
            ? FilterValue.empty
            : FilterValue.fromJS(expr.value.initialValue);

        return {
            type: 'leaf',
            value
        };
    }
}

export function getFilterStateById(state: FilterState, id: FilterId): FilterFormState {
    const filter = state.get(id);
    if (!filter) {
        throw new Error(`Inconsistent state: Filter with id ${id} not found`);
    }
    return filter;
}

export function setFilterStateById(state: FilterState, id: FilterId, newFilterState: FilterFormState): FilterState {
    if (!state.has(id)) {
        throw new Error(`Inconsistent state: Filter with id ${id} not found`);
    }
    const newState = new Map(state);
    newState.set(id, newFilterState);
    return newState;
}

// AppState data structure for app state
export interface AppState {
    selectedViewId: ViewId
    views: View[]
    filterGroups: FilterGroups
    searchQuery: string
    filterDisplayState: FilterDisplayState
    data: FetchDataResult
    filterState: FilterState
    appliedFilterState: FilterState
    pagination: PaginationState
}

export interface PaginationState {
    page: number;
    cursors: (string | number | null)[];
    rowsPerPage: number;
}

function createPaginationState(rowsPerPage: number): PaginationState {
    return {
        page: 0,
        cursors: [],
        rowsPerPage
    };
}

export function createDefaultFilterState(filterGroups: FilterGroups, mode: FormStateInitMode = FormStateInitMode.WithInitialValues): FilterState {
    return new Map(getAllFilters(filterGroups).map(filter => [filter.id, buildInitialFormState(filter.expression, mode)]));
}

const DEFAULT_ROWS_PER_PAGE = 20

export function createDefaultAppState(views: View[], rowsPerPageOptions: number[]): AppState {
    const selectedViewId = views[0]?.id;
    const view = views.find(v => v.id === selectedViewId) as View;
    const filterGroups: FilterGroups = view.filterGroups;
    const initialFilterState = createDefaultFilterState(filterGroups);
    const initialRowsPerPage = rowsPerPageOptions.length > 0
        ? rowsPerPageOptions[0]
        : DEFAULT_ROWS_PER_PAGE;
    const defaultSearchQuery = '';
    return {
        views,
        selectedViewId,
        filterGroups,
        searchQuery: defaultSearchQuery,
        filterDisplayState: createFilterDisplayState(filterGroups, defaultSearchQuery),
        data: { flattenedRows: [], rows: [] },
        filterState: initialFilterState,
        appliedFilterState: initialFilterState,
        pagination: createPaginationState(initialRowsPerPage)
    };
}

function setSelectedViewId(state: AppState, newId: ViewId): AppState {
    const view = state.views.find(v => v.id === newId);
    const filterGroups = view?.filterGroups || [];
    const filterDisplayState = createFilterDisplayState(filterGroups, state.searchQuery);
    return {
        ...state,
        selectedViewId: newId,
        filterGroups,
        filterDisplayState,
        filterState: createDefaultFilterState(filterGroups),
        appliedFilterState: createDefaultFilterState(filterGroups),
        // Retain current rowsPerPage while resetting page & cursors
        pagination: createPaginationState(state.pagination.rowsPerPage)
    };
}

function getSelectedView(state: AppState): View {
    return state.views.find(v => v.id === state.selectedViewId) as View;
}

function setDataRows(state: AppState, newRows: FetchDataResult, pagination?: PaginationState): AppState {
    // If caller provides a pagination object, ensure rowsPerPage is preserved when omitted
    let nextPagination: PaginationState;
    if (pagination) {
        nextPagination = {
            page: pagination.page,
            cursors: pagination.cursors,
            rowsPerPage: pagination.rowsPerPage
        };
    } else {
        // No pagination override; keep existing pagination (useful for simple data refresh)
        nextPagination = state.pagination;
    }
    return {
        ...state,
        data: newRows,
        pagination: nextPagination
    };
}

function setFilterGroups(state: AppState, newFilterGroups: FilterGroups): AppState {
    const filterDisplayState = createFilterDisplayState(newFilterGroups, state.searchQuery);
    return {
        ...state,
        filterGroups: newFilterGroups,
        filterDisplayState
    };
}

function setSearchQuery(state: AppState, searchQuery: string): AppState {
    const filterDisplayState = createFilterDisplayState(state.filterGroups, searchQuery);
    return {
        ...state,
        searchQuery,
        filterDisplayState
    };
}

function setFilterGroupExpanded(state: AppState, groupName: string, expanded: boolean): AppState {
    const next = new Set(state.filterDisplayState.expandedGroups);
    if (expanded) {
        next.add(groupName);
    } else {
        next.delete(groupName);
    }

    const expandedGroups = Array.from(next);
    return {
        ...state,
        filterDisplayState: state.filterDisplayState.type === 'searchResults'
            ? {
                type: 'searchResults',
                filterGroups: state.filterDisplayState.filterGroups,
                expandedGroups
            }
            : {
                type: 'all',
                expandedGroups
            }
    };
}

function setFilterState(state: AppState, newFilterState: FilterState): AppState {
    return {
        ...state,
        filterState: newFilterState,
        // Reset page & cursors but keep current rowsPerPage
        pagination: createPaginationState(state.pagination.rowsPerPage)
    };
}

function setAppliedFilterState(state: AppState, newAppliedFilterState: FilterState): AppState {
    return {
        ...state,
        appliedFilterState: newAppliedFilterState,
        pagination: createPaginationState(state.pagination.rowsPerPage)
    };
}

function setRowsPerPage(state: AppState, newRowsPerPage: number): AppState {
    if (state.pagination.rowsPerPage === newRowsPerPage) return state; // no change
    return {
        ...state,
        pagination: { page: 0, cursors: [], rowsPerPage: newRowsPerPage }
    };
}

export const useAppState = (views: View[], rowsPerPageOptions: number[], initialFilterStateOverride?: FilterState) => {
    const [appState, setAppState] = useState<AppState>(() => {
        const base = createDefaultAppState(views, rowsPerPageOptions);
        if (initialFilterStateOverride) {
            return {
                ...base,
                filterState: initialFilterStateOverride,
                appliedFilterState: initialFilterStateOverride
            };
        }
        return base;
    });

    const updateSelectedViewId = useCallback((id: ViewId) => {
        setAppState(prev => setSelectedViewId(prev, id));
    }, []);

    const updateDataRows = useCallback((rows: FetchDataResult, pagination?: PaginationState) => {
        setAppState(prev => setDataRows(prev, rows, pagination));
    }, []);

    const updateFilterGroups = useCallback((groups: FilterGroups) => {
        setAppState(prev => setFilterGroups(prev, groups));
    }, []);

    const updateFilterState = useCallback((filterState: FilterState) => {
        setAppState(prev => setFilterState(prev, filterState));
    }, []);

    const updateAppliedFilterState = useCallback((filterState: FilterState) => {
        setAppState(prev => setAppliedFilterState(prev, filterState));
    }, []);

    const updateSearchQuery = useCallback((searchQuery: string) => {
        setAppState(prev => setSearchQuery(prev, searchQuery));
    }, []);

    const updateFilterGroupExpanded = useCallback((groupName: string, expanded: boolean) => {
        setAppState(prev => setFilterGroupExpanded(prev, groupName, expanded));
    }, []);

    const updateRowsPerPage = useCallback((value: number) => {
        setAppState(prev => setRowsPerPage(prev, value));
    }, []);

    return {
        state: appState,
        selectedView: getSelectedView(appState),
        setSelectedViewId: updateSelectedViewId,
        setDataRows: updateDataRows,
        setFilterGroups: updateFilterGroups,
        setFilterState: updateFilterState,
        setAppliedFilterState: updateAppliedFilterState,
        setSearchQuery: updateSearchQuery,
        setFilterGroupExpanded: updateFilterGroupExpanded,
        setRowsPerPage: updateRowsPerPage
    };
}

export { setSelectedViewId, setDataRows, setFilterGroups, setFilterState, setAppliedFilterState, setSearchQuery, setFilterGroupExpanded, setRowsPerPage };

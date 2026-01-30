import { useState } from "react";
import { FilterFormState } from "../components/FilterForm";
import { FilterSchemasAndGroups, FilterId, FilterExpr } from "./filters";
import { View, ViewId } from "./view";
import { FetchDataResult } from "./data";

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
            // - Fallback ''
            const baseValue = mode === FormStateInitMode.Empty
                ? ''
                : (('initialValue' in expr.value && expr.value.initialValue !== undefined)
                    ? expr.value.initialValue
                    : (('initialValue' in expr.value.valueControl && expr.value.valueControl.initialValue !== undefined)
                        ? expr.value.valueControl.initialValue
                        : ''));
            return {
                type: 'leaf',
                value: { operator, value: baseValue }
            };
        }
        return {
            type: 'leaf',
            value: mode === FormStateInitMode.Empty
                ? ''
                : ('initialValue' in expr.value && expr.value.initialValue !== undefined ? expr.value.initialValue : '')
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
    filterSchemasAndGroups: FilterSchemasAndGroups
    data: FetchDataResult
    filterState: FilterState
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

export function createDefaultFilterState(filterSchema: FilterSchemasAndGroups, mode: FormStateInitMode = FormStateInitMode.WithInitialValues): FilterState {
    return new Map(filterSchema.filters.map(filter => [filter.id, buildInitialFormState(filter.expression, mode)]));
}

const DEFAULT_ROWS_PER_PAGE = 20

export function createDefaultAppState(views: View[], rowsPerPageOptions: number[]): AppState {
    const selectedViewId = views[0]?.id;
    const view = views.find(v => v.id === selectedViewId) as View;
    const filterSchema: FilterSchemasAndGroups = view.filterSchema;
    const initialFilterState = createDefaultFilterState(filterSchema);
    const initialRowsPerPage = rowsPerPageOptions.length > 0
        ? rowsPerPageOptions[0]
        : DEFAULT_ROWS_PER_PAGE;
    return {
        views,
        selectedViewId,
        filterSchemasAndGroups: filterSchema,
        data: { flattenedRows: [], rows: [] },
        filterState: initialFilterState,
        pagination: createPaginationState(initialRowsPerPage)
    };
}

function setSelectedViewId(state: AppState, newId: ViewId): AppState {
    const view = state.views.find(v => v.id === newId);
    const filterSchema = view?.filterSchema || { groups: [], filters: [] };
    return {
        ...state,
        selectedViewId: newId,
        filterSchemasAndGroups: filterSchema,
        filterState: createDefaultFilterState(filterSchema),
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

function setFilterSchema(state: AppState, newSchema: FilterSchemasAndGroups): AppState {
    return {
        ...state,
        filterSchemasAndGroups: newSchema
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
            return { ...base, filterState: initialFilterStateOverride };
        }
        return base;
    });
    return {
        state: appState,
        selectedView: getSelectedView(appState),
        setSelectedViewId: (id: ViewId) => setAppState(prev => setSelectedViewId(prev, id)),
        setDataRows: (rows: FetchDataResult, pagination?: PaginationState) => setAppState(prev => setDataRows(prev, rows, pagination)),
        setFilterSchema: (schema: FilterSchemasAndGroups) => setAppState(prev => setFilterSchema(prev, schema)),
        setFilterState: (filterState: FilterState) => setAppState(prev => setFilterState(prev, filterState)),
        setRowsPerPage: (value: number) => setAppState(prev => setRowsPerPage(prev, value))
    };
}

export { setSelectedViewId, setDataRows, setFilterSchema, setFilterState, setRowsPerPage };

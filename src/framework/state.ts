import { useState } from "react";
import { FilterFormState } from "../components/FilterForm";
import { FilterFieldSchema, FilterId, FilterExpr } from "./filters";
import { View } from "./view";
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
            children: expr.filters.map(child => buildInitialFormState(child, mode)),
            filterType: expr.type
        };
    } else if (expr.type === 'not') {
        return {
            type: 'not',
            child: buildInitialFormState(expr.filter, mode),
            filterType: 'not'
        };
    } else {
        return {
            type: 'leaf',
            field: expr.field,
            value: mode === FormStateInitMode.Empty ? '' : ('initialValue' in expr.value && expr.value.initialValue !== undefined ? expr.value.initialValue : ''),
            control: expr.value,
            filterType: expr.type,
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
    selectedViewIndex: number
    views: View[]
    filterSchema: FilterFieldSchema
    data: FetchDataResult
    filterState: FilterState
    pagination: PaginationState
}

export interface PaginationState {
    page: number;
    cursors: (string | number | null)[];
}

const defaultPagination: PaginationState = {
    page: 0,
    cursors: []
};

// Utility to get initial view index from URL or default
export function getInitialViewIndex(views: View[]): number {
    const params = new URLSearchParams(window.location.search);
    const viewName = params.get('view');
    if (viewName) {
        const index = views.findIndex((view: View) => view.id === viewName);
        if (index !== -1) {
            return index;
        }
    }
    // Update URL if no view parameter or invalid viewName
    const defaultViewName = views[0]?.id;
    if (defaultViewName) {
        window.history.replaceState({}, '', `?view=${defaultViewName}`);
    }
    return 0;
}


export function createDefaultFilterState(filterSchema: FilterFieldSchema, mode: FormStateInitMode = FormStateInitMode.WithInitialValues): FilterState {
    return new Map(filterSchema.filters.map(filter => [filter.id, buildInitialFormState(filter.expression, mode)]));
}

export function createDefaultAppState(views: View[]): AppState {
    const selectedViewIndex = getInitialViewIndex(views);
    const filterSchema: FilterFieldSchema = views[selectedViewIndex].filterSchema;
    const initialFilterState = createDefaultFilterState(filterSchema);
    return {
        views,
        selectedViewIndex,
        filterSchema,
        data: { flattenedRows: [], rows: [] },
        filterState: initialFilterState,
        pagination: defaultPagination
    };
}

// Update selectedViewIndex
function setSelectedViewIndex(state: AppState, newIndex: number): AppState {
    const view = state.views[newIndex];
    const filterSchema = view.filterSchema || { groups: [], filters: [] };
    return {
        ...state,
        selectedViewIndex: newIndex,
        filterSchema,
        filterState: createDefaultFilterState(filterSchema),
        pagination: defaultPagination
    };
}

function getSelectedView(state: AppState): View {
    return state.views[state.selectedViewIndex];
}

function setDataRows(state: AppState, newRows: FetchDataResult, pagination: PaginationState = defaultPagination): AppState {
    return {
        ...state,
        data: newRows,
        pagination
    };
}

function setFilterSchema(state: AppState, newSchema: FilterFieldSchema): AppState {
    return {
        ...state,
        filterSchema: newSchema
    };
}

function setFilterState(state: AppState, newFilterState: FilterState): AppState {
    return {
        ...state,
        filterState: newFilterState,
        pagination: defaultPagination
    };
}

export const useAppState = (views: View[]) => {
    const [appState, setAppState] = useState<AppState>(() => createDefaultAppState(views));
    return {
        state: appState,
        selectedView: getSelectedView(appState),
        setSelectedViewIndex: (index: number) => setAppState(prev => setSelectedViewIndex(prev, index)),
        setDataRows: (rows: FetchDataResult, pagination?: PaginationState) => setAppState(prev => setDataRows(prev, rows, pagination)),
        setFilterSchema: (schema: FilterFieldSchema) => setAppState(prev => setFilterSchema(prev, schema)),
        setFilterState: (filterState: FilterState) => setAppState(prev => setFilterState(prev, filterState))
    };
}

export { setSelectedViewIndex, setDataRows, setFilterSchema, setFilterState };

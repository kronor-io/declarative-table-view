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
        return {
            type: 'leaf',
            value: mode === FormStateInitMode.Empty ? '' : ('initialValue' in expr.value && expr.value.initialValue !== undefined ? expr.value.initialValue : '')
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
}

const defaultPagination: PaginationState = {
    page: 0,
    cursors: []
};

export function createDefaultFilterState(filterSchema: FilterSchemasAndGroups, mode: FormStateInitMode = FormStateInitMode.WithInitialValues): FilterState {
    return new Map(filterSchema.filters.map(filter => [filter.id, buildInitialFormState(filter.expression, mode)]));
}

export function createDefaultAppState(views: View[]): AppState {
    const selectedViewId = views[0]?.id;
    const view = views.find(v => v.id === selectedViewId) as View;
    const filterSchema: FilterSchemasAndGroups = view.filterSchema;
    const initialFilterState = createDefaultFilterState(filterSchema);
    return {
        views,
        selectedViewId,
        filterSchemasAndGroups: filterSchema,
        data: { flattenedRows: [], rows: [] },
        filterState: initialFilterState,
        pagination: defaultPagination
    };
}

// Update selectedViewId
function setSelectedViewId(state: AppState, newId: ViewId): AppState {
    const view = state.views.find(v => v.id === newId);
    const filterSchema = view?.filterSchema || { groups: [], filters: [] };
    return {
        ...state,
        selectedViewId: newId,
        filterSchemasAndGroups: filterSchema,
        filterState: createDefaultFilterState(filterSchema),
        pagination: defaultPagination
    };
}

function getSelectedView(state: AppState): View {
    return state.views.find(v => v.id === state.selectedViewId) as View;
}

function setDataRows(state: AppState, newRows: FetchDataResult, pagination: PaginationState = defaultPagination): AppState {
    return {
        ...state,
        data: newRows,
        pagination
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
        pagination: defaultPagination
    };
}

export const useAppState = (views: View[]) => {
    const [appState, setAppState] = useState<AppState>(() => createDefaultAppState(views));
    return {
        state: appState,
        selectedView: getSelectedView(appState),
        setSelectedViewId: (id: ViewId) => setAppState(prev => setSelectedViewId(prev, id)),
        setDataRows: (rows: FetchDataResult, pagination?: PaginationState) => setAppState(prev => setDataRows(prev, rows, pagination)),
        setFilterSchema: (schema: FilterSchemasAndGroups) => setAppState(prev => setFilterSchema(prev, schema)),
        setFilterState: (filterState: FilterState) => setAppState(prev => setFilterState(prev, filterState))
    };
}

export { setSelectedViewId, setDataRows, setFilterSchema, setFilterState };

import { useState } from "react";
import { buildInitialFormState, FilterFormState } from "../components/FilterForm";
import { FilterFieldSchema } from "./filters";
import { View } from "./view";
import { FetchDataResult } from "./data";

// AppState data structure for app state
export interface AppState {
    selectedViewIndex: number;
    views: View<any, any>[];
    filterSchema: FilterFieldSchema;
    data: FetchDataResult;
    filterState: FilterFormState[];
    pagination: PaginationState;
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
export function getInitialViewIndex(views: View<any, any>[]): number {
    const params = new URLSearchParams(window.location.search);
    const viewName = params.get('view');
    if (viewName) {
        const index = views.findIndex((view: View<any, any>) => view.routeName === viewName);
        if (index !== -1) {
            return index;
        }
    }
    // Update URL if no view parameter or invalid viewName
    const defaultViewName = views[0]?.routeName;
    if (defaultViewName) {
        window.history.replaceState({}, '', `?view=${defaultViewName}`);
    }
    return 0;
}

function createInitialFilterState(filterSchema: FilterFieldSchema): FilterFormState[] {
    return filterSchema.filters.map(filter => buildInitialFormState(filter.expression));
}

export function createDefaultAppState(views: View<any, any>[]): AppState {
    const selectedViewIndex = getInitialViewIndex(views);
    const filterSchema: FilterFieldSchema = views[selectedViewIndex].filterSchema;
    const initialFilterState = createInitialFilterState(filterSchema);
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
        filterState: createInitialFilterState(filterSchema),
        pagination: defaultPagination
    };
}

function getSelectedView(state: AppState): View<any, any> {
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

function setFilterState(state: AppState, newFilterState: FilterFormState[]): AppState {
    return {
        ...state,
        filterState: newFilterState,
        pagination: defaultPagination
    };
}

export const useAppState = (views: View<any, any>[]) => {
    const [appState, setAppState] = useState<AppState>(() => createDefaultAppState(views));
    return {
        state: appState,
        selectedView: getSelectedView(appState),
        setSelectedViewIndex: (index: number) => setAppState(prev => setSelectedViewIndex(prev, index)),
        setDataRows: (rows: FetchDataResult, pagination?: PaginationState) => setAppState(prev => setDataRows(prev, rows, pagination)),
        setFilterSchema: (schema: FilterFieldSchema) => setAppState(prev => setFilterSchema(prev, schema)),
        setFilterState: (filterState: FilterFormState[]) => setAppState(prev => setFilterState(prev, filterState))
    };
}

export { setSelectedViewIndex, setDataRows, setFilterSchema, setFilterState };

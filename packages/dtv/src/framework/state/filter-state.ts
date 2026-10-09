import { FilterFormState } from "../filter-form-state";
import * as FilterValue from "../filterValue";
import { FilterGroups, FilterId, FilterExpr } from "../filters";
import { getAllFilters } from "../view";
import { valuesEqual } from "../equality";

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

function filterFormStatesEqual(left: FilterFormState, right: FilterFormState): boolean {
    if (left.type !== right.type) return false;

    switch (left.type) {
        case 'leaf':
            return right.type === 'leaf' && valuesEqual(left.value, right.value);
        case 'not':
            return right.type === 'not' && filterFormStatesEqual(left.child, right.child);
        case 'and':
        case 'or':
            return right.type === left.type
                && left.children.length === right.children.length
                && left.children.every((child, index) => filterFormStatesEqual(child, right.children[index]));
    }
}

export function filterStatesEqual(left: FilterState, right: FilterState): boolean {
    if (left.size !== right.size) return false;

    for (const [filterId, leftFilterState] of left) {
        const rightFilterState = right.get(filterId);
        if (!rightFilterState) return false;
        if (!filterFormStatesEqual(leftFilterState, rightFilterState)) return false;
    }

    return true;
}

export function createDefaultFilterState(filterGroups: FilterGroups, mode: FormStateInitMode = FormStateInitMode.WithInitialValues): FilterState {
    return new Map(getAllFilters(filterGroups).map(filter => [filter.id, buildInitialFormState(filter.expression, mode)]));
}

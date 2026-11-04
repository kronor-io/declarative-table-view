import type { FilterExpr, FilterField, FilterControl, FilterSchema, FilterId } from '../framework/filters';
import { FilterState } from '../framework/state';
import { FilterFormState, isFilterEmpty, traverseFilterSchemaAndState } from '../framework/filter-form-state';
import * as FilterValue from '../framework/filterValue';
import { formatControlValue } from './controlFormat';

export interface FilterStatePillItem {
    filterId: FilterId;
    displayText: string;
}

type LeafFilterExpr = Extract<FilterExpr, { field: FilterField; value: FilterControl }>;

function getFilterFieldDisplay(field: FilterField): string {
    if (typeof field === 'string') return field;
    if (field && typeof field === 'object') {
        if ('and' in field) return field.and.join(' & ');
        if ('or' in field) return field.or.join(' | ');
    }
    return String(field);
}

function getOperatorDisplay(exprType: FilterExpr['type']): string {
    switch (exprType) {
        case 'equals':
            return '=';
        case 'notEquals':
            return '≠';
        case 'greaterThan':
            return '>';
        case 'lessThan':
            return '<';
        case 'greaterThanOrEqual':
            return '≥';
        case 'lessThanOrEqual':
            return '≤';
        case 'in':
            return 'in';
        case 'notIn':
            return 'not in';
        case 'like':
            return 'like';
        case 'iLike':
            return 'ilike';
        case 'isNull':
            return 'is null';
        default:
            return exprType;
    }
}

// The leaf's own formatter when it has one, else the control's format.
function formatLeafValue(schemaLeaf: LeafFilterExpr, controlValue: unknown): string {
    const format = (value: unknown) => formatControlValue(schemaLeaf.value, value);
    if (!schemaLeaf.formatValue) {
        return format(controlValue);
    }
    try {
        return schemaLeaf.formatValue(controlValue, { format });
    } catch {
        // A formatter that fails still leaves a readable pill.
        return format(controlValue);
    }
}

// Long free-text values would stretch the pill.
function truncateForPill(text: string): string {
    return text.length > 128 ? `${text.substring(0, 128)}...` : text;
}

function formatLeaf(schemaLeaf: LeafFilterExpr, stateLeaf: FilterFormState & { type: 'leaf' }): string {
    if (isFilterEmpty(stateLeaf, schemaLeaf)) {
        return '';
    }

    const field = `${schemaLeaf.fieldLabel ?? getFilterFieldDisplay(schemaLeaf.field)} `;
    // The value the user picked, as the form shows it. A transform's toQuery
    // output is what the query needs, not what the user chose, so it is never shown.
    const controlValue = FilterValue.valueOrNull(stateLeaf.value);
    const valueStr = truncateForPill(formatLeafValue(schemaLeaf, controlValue));

    // A customOperator's value carries its own operator.
    if (schemaLeaf.value.type === 'customOperator') {
        return `${field}${valueStr}`.trim();
    }

    const operator = schemaLeaf.type === 'in' && Array.isArray(controlValue) && controlValue.length === 1
        ? getOperatorDisplay('equals')
        : getOperatorDisplay(schemaLeaf.type);
    return `${field}${operator} ${valueStr}`.trim();
}

function renderExpressionWithState(expr: FilterExpr, node: FilterFormState): string {
    return traverseFilterSchemaAndState<string>(expr, node, {
        leaf: (schemaLeaf, stateLeaf) => {
            return formatLeaf(schemaLeaf, stateLeaf);
        },
        and: (_schemaAnd, _stateAnd, childResults) => {
            const parts = childResults.filter(Boolean);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            return `AND(${parts.join(', ')})`;
        },
        or: (_schemaOr, _stateOr, childResults) => {
            const parts = childResults.filter(Boolean);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            return `OR(${parts.join(', ')})`;
        },
        not: (_schemaNot, _stateNot, childResult) => {
            if (!childResult) return '';
            return `NOT(${childResult})`;
        }
    });
}

export function getFilterStatePillItems(filterState: FilterState, filters: FilterSchema[]): FilterStatePillItem[] {
    if (!filterState || filterState.size === 0) {
        return [];
    }

    const schemaById = new Map(filters.map(filter => [filter.id, filter] as const));

    return Array.from(filterState.entries()).flatMap(([filterId, filter]) => {
        const schemaEntry = schemaById.get(filterId);
        if (!schemaEntry) {
            return [];
        }

        try {
            if (isFilterEmpty(filter, schemaEntry.expression)) {
                return [];
            }
        } catch {
            return [];
        }

        return [{
            filterId,
            displayText: renderExpressionWithState(schemaEntry.expression, filter)
        }];
    });
}

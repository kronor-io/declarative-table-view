import type { FilterExpr, FilterField, FilterControl, FilterSchema, FilterId } from '../framework/filters';
import { FilterState } from '../framework/state';
import { FilterFormState, isFilterEmpty, traverseFilterSchemaAndState } from '../framework/filter-form-state';
import * as FilterValue from '../framework/filterValue';

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

function getFieldValueDisplay(value: unknown): string {
    if (value instanceof Date) {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(value);
    }
    if (typeof value === 'string') {
        return value.length > 128 ? `${value.substring(0, 128)}...` : value;
    }
    if (Array.isArray(value)) {
        return value.map(v => getFieldValueDisplay(v)).join(', ');
    }
    if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.label === 'string') {
            return obj.label;
        }
        if ('value' in obj) {
            return getFieldValueDisplay(obj.value);
        }
        return JSON.stringify(value);
    }
    return String(value);
}

function getControlValueDisplay(control: FilterControl, controlValue: unknown): string {
    if (controlValue && typeof controlValue === 'object') {
        const obj = controlValue as Record<string, unknown>;
        if (typeof obj.label === 'string') {
            return obj.label;
        }
    }

    if (control.type === 'dropdown') {
        const item = control.items.find(item => item.value === controlValue);
        return item ? item.label : getFieldValueDisplay(controlValue);
    }

    if (control.type === 'multiselect') {
        if (!Array.isArray(controlValue)) {
            return getFieldValueDisplay(controlValue);
        }
        return controlValue
            .map(value => {
                const item = control.items.find(item => item.value === value);
                return item ? item.label : getFieldValueDisplay(value);
            })
            .join(', ');
    }

    return getFieldValueDisplay(controlValue);
}

function isEmptyLikeDisplayValue(value: unknown): boolean {
    return (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
    );
}

function getLeafValueForDisplay(schemaLeaf: LeafFilterExpr, stateLeaf: FilterFormState & { type: 'leaf' }): unknown {
    const baseInput = FilterValue.valueOrNull(stateLeaf.value);

    if (schemaLeaf.value.type === 'customOperator') {
        return baseInput;
    }

    const transform = schemaLeaf.transform?.toQuery;
    if (!transform) {
        return baseInput;
    }

    try {
        const transformed = transform(baseInput, { field: schemaLeaf.field });
        if ('condition' in transformed) {
            return baseInput;
        }

        const transformedValue = FilterValue.valueOrNull(transformed.value);
        if (isEmptyLikeDisplayValue(transformedValue)) {
            return baseInput;
        }

        return transformedValue;
    } catch {
        return baseInput;
    }
}

function formatLeaf(schemaLeaf: LeafFilterExpr, stateLeaf: FilterFormState & { type: 'leaf' }): string {
    if (isFilterEmpty(stateLeaf, schemaLeaf)) {
        return '';
    }

    const field = `${getFilterFieldDisplay(schemaLeaf.field)} `;
    const displayValue = getLeafValueForDisplay(schemaLeaf, stateLeaf);

    if (schemaLeaf.value.type === 'customOperator') {
        const valueObj = displayValue as { operator?: string; value?: FilterValue.FilterValue } | null;
        const operatorValue = valueObj?.operator;
        const operatorLabel = schemaLeaf.value.operators.find(o => o.value === operatorValue)?.label ?? String(operatorValue ?? '');
        const controlValue = valueObj?.value ? FilterValue.valueOrNull(valueObj.value) : null;
        const valueStr = getControlValueDisplay(schemaLeaf.value.valueControl, controlValue);
        return `${field}${operatorLabel} ${valueStr}`.trim();
    }

    const operator = schemaLeaf.type === 'in' && Array.isArray(displayValue) && displayValue.length === 1
        ? getOperatorDisplay('equals')
        : getOperatorDisplay(schemaLeaf.type);
    const valueStr = getControlValueDisplay(schemaLeaf.value, displayValue);
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

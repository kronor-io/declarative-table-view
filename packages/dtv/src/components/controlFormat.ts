import PrimeReact from 'primereact/api';
import type { FilterControl } from '../framework/filters';
import * as FilterValue from '../framework/filterValue';

// Shared with the InputNumber in FilterForm, so the form and formatControlValue agree.
export const NUMBER_CONTROL_MAX_FRACTION_DIGITS = 12;

type Item = { label: string; value: unknown };

/**
 * What a control shows for its value, as text. Mirrors `renderInput` in
 * FilterForm.tsx: each control type formats the way its input displays, so a
 * pill reads the same as the form it came from.
 *
 * Only a `custom` control, and a value a control cannot place (an item no
 * longer in the list, say), fall back to guessing from the value's shape.
 */
export function formatControlValue(control: FilterControl, value: unknown): string {
    switch (control.type) {
        case 'text':
            return typeof value === 'string' ? value : formatUnknownValue(value);
        case 'number':
            // InputNumber formats with PrimeReact's locale, which DTV does not override.
            return typeof value === 'number'
                ? new Intl.NumberFormat(PrimeReact.locale, {
                    useGrouping: true,
                    maximumFractionDigits: NUMBER_CONTROL_MAX_FRACTION_DIGITS
                }).format(value)
                : formatUnknownValue(value);
        case 'date':
            return value instanceof Date && !Number.isNaN(value.getTime())
                ? formatDate(value, control.showTime ?? true)
                : formatUnknownValue(value);
        case 'dropdown':
            return formatItem(control.items, value);
        case 'multiselect':
            return Array.isArray(value)
                ? value.map(v => formatItem(control.items, v)).join(', ')
                : formatItem(control.items, value);
        case 'customOperator': {
            const { operator, value: innerValue } = (value ?? {}) as { operator?: string; value?: FilterValue.FilterValue };
            const operatorLabel = control.operators.find(o => o.value === operator)?.label ?? String(operator ?? '');
            // An operator without a value (`is empty`) reads as its label alone.
            const innerDisplay = innerValue && FilterValue.isValue(innerValue)
                ? formatControlValue(control.valueControl, innerValue.value)
                : '';
            return `${operatorLabel} ${innerDisplay}`.trim();
        }
        case 'autocomplete': {
            const labelField = control.suggestionLabelField ?? 'label';
            return Array.isArray(value)
                ? value.map(v => formatSuggestion(labelField, v)).join(', ')
                : formatSuggestion(labelField, value);
        }
        case 'custom':
            return formatUnknownValue(value);
        default: {
            const unhandled: never = control;
            return formatUnknownValue(unhandled);
        }
    }
}

// Same pattern as the Calendar in FilterForm (dateFormat 'yy-mm-dd', 24-hour time), in local time.
function formatDate(value: Date, showTime: boolean): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    if (!showTime) {
        return date;
    }
    return `${date} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

// Dropdown and MultiSelect show an item's label (optionLabel 'label').
function formatItem(items: Item[], value: unknown): string {
    const item = items.find(item => item.value === value);
    return item ? item.label : formatUnknownValue(value);
}

// AutoComplete shows a suggestion's `suggestionLabelField`.
function formatSuggestion(labelField: string, value: unknown): string {
    if (value && typeof value === 'object') {
        const label = (value as Record<string, unknown>)[labelField];
        if (label !== undefined && label !== null) {
            return String(label);
        }
    }
    return formatUnknownValue(value);
}

function formatUnknownValue(value: unknown): string {
    if (value instanceof Date) {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(value);
    }
    if (Array.isArray(value)) {
        return value.map(v => formatUnknownValue(v)).join(', ');
    }
    if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.label === 'string') {
            return obj.label;
        }
        if ('value' in obj) {
            return formatUnknownValue(obj.value);
        }
        return JSON.stringify(value);
    }
    return String(value);
}

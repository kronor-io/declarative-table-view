import * as React from 'react';
import { GraphQLClient } from 'graphql-request';

// Multi-field specification
export type FilterField =
    | string  // Single field: "name" or "user.email"
    | { and: string[] }  // AND multiple fields: { and: ["name", "title", "description"] }
    | { or: string[] };  // OR multiple fields: { or: ["name", "title", "description"] }

// Transform result type - must return an object with optional field/value fields
export type TransformResult = { field?: string; value?: unknown };

// Transform functions for filter expressions
export type FilterTransform = {
    toQuery?: (input: unknown) => TransformResult;
};

export type FilterControl =
    | { type: 'text'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'number'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'date'; label?: string; placeholder?: string; initialValue?: any, showTime?: boolean }
    | { type: 'dropdown'; label?: string; items: { label: string; value: any }[]; initialValue?: any }
    | { type: 'multiselect'; label?: string; items: { label: string; value: any }[], filterable?: boolean; initialValue?: any }
    | { type: 'customOperator'; label?: string; operators: { label: string; value: string }[]; valueControl: FilterControl; initialValue?: any }
    | { type: 'autocomplete'; label?: string; placeholder?: string; initialValue?: any; suggestionFetcher: (query: string, client: GraphQLClient) => Promise<string[]>, queryMinLength?: number }
    | { type: 'custom'; component: React.ComponentType<any>; props?: Record<string, any>; label?: string; initialValue?: any };

export type FilterExpr =
    | { type: 'equals'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'notEquals'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'greaterThan'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'lessThan'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'greaterThanOrEqual'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'lessThanOrEqual'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'in'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'notIn'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'like'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'iLike'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'isNull'; field: FilterField; value: FilterControl; transform?: FilterTransform }
    | { type: 'and'; filters: FilterExpr[] }
    | { type: 'or'; filters: FilterExpr[] }
    | { type: 'not'; filter: FilterExpr };

// Predefined list of supported operators for customOperator controls
export const SUPPORTED_OPERATORS = [
    { label: 'equals', value: '_eq' },
    { label: 'not equals', value: '_neq' },
    { label: 'greater than', value: '_gt' },
    { label: 'less than', value: '_lt' },
    { label: 'greater than or equal', value: '_gte' },
    { label: 'less than or equal', value: '_lte' },
    { label: 'in', value: '_in' },
    { label: 'not in', value: '_nin' },
    { label: 'like', value: '_like' },
    { label: 'ilike', value: '_ilike' },
    { label: 'is null', value: '_is_null' }
];

export type SuggestionFetcher = (query: string, client: GraphQLClient) => Promise<string[]>

// Helper functions for building FilterControl values
export const filterControl = {
    text: (options?: { label?: string; placeholder?: string }): FilterControl => ({ type: 'text', ...options }),
    number: (options?: { label?: string; placeholder?: string; initialValue?: any }): FilterControl => ({ type: 'number', ...options }),
    date: (options?: { label?: string; placeholder?: string; initialValue?: any }): FilterControl => ({ type: 'date', ...options }),
    dropdown: (options: { label?: string; items: { label: string; value: any }[] }): FilterControl => ({ type: 'dropdown', ...options }),
    multiselect: (options: { label?: string; items: { label: string; value: any }[], filterable?: boolean }): FilterControl => ({ type: 'multiselect', ...options }),
    customOperator: (options: { label?: string; operators: { label: string; value: string }[]; valueControl: FilterControl }): FilterControl => ({ type: 'customOperator', ...options }),
    autocomplete: (options: { label?: string; placeholder?: string; suggestionFetcher: SuggestionFetcher }): FilterControl => ({ type: 'autocomplete', ...options }),
    custom: (component: React.ComponentType<any>, options?: { label?: string; props?: Record<string, any> }): FilterControl => ({ type: 'custom', component, ...options }),
};

// Helper functions for building FilterExpr values
export const filterExpr = {
    equals: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'equals', field, value, ...(transform && { transform }) }),
    notEquals: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'notEquals', field, value, ...(transform && { transform }) }),
    greaterThan: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'greaterThan', field, value, ...(transform && { transform }) }),
    lessThan: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'lessThan', field, value, ...(transform && { transform }) }),
    greaterThanOrEqual: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'greaterThanOrEqual', field, value, ...(transform && { transform }) }),
    lessThanOrEqual: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'lessThanOrEqual', field, value, ...(transform && { transform }) }),
    in: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'in', field, value, ...(transform && { transform }) }),
    notIn: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'notIn', field, value, ...(transform && { transform }) }),
    like: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'like', field, value, ...(transform && { transform }) }),
    iLike: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'iLike', field, value, ...(transform && { transform }) }),
    isNull: (field: FilterField, value: FilterControl, transform?: FilterTransform): FilterExpr => ({ type: 'isNull', field, value, ...(transform && { transform }) }),
    and: (filters: FilterExpr[]): FilterExpr => ({ type: 'and', filters }),
    or: (filters: FilterExpr[]): FilterExpr => ({ type: 'or', filters }),
    not: (filter: FilterExpr): FilterExpr => ({ type: 'not', filter }),
    range: (field: FilterField, control: (options: any) => FilterControl, transform?: FilterTransform): FilterExpr =>
        filterExpr.and([
            filterExpr.greaterThanOrEqual(field, control({ placeholder: 'from' }), transform),
            filterExpr.lessThanOrEqual(field, control({ placeholder: 'to' }), transform)
        ]),
    allOperators: SUPPORTED_OPERATORS,
};

// Helper to check if a FilterExpr is a leaf node
export function isLeaf(expr: FilterExpr): expr is Extract<FilterExpr, { field: FilterField; value: FilterControl }> {
    return 'field' in expr && 'value' in expr;
}

// Recursively transform the value of every leaf node in a FilterExpr tree
export function transformFilterExprValues(expr: FilterExpr, fn: (value: FilterControl) => FilterControl): FilterExpr {
    if (expr.type === 'and' || expr.type === 'or') {
        return { ...expr, filters: expr.filters.map(e => transformFilterExprValues(e, fn)) };
    } else if (expr.type === 'not') {
        return { ...expr, filter: transformFilterExprValues(expr.filter, fn) };
    } else {
        return { ...expr, value: fn(expr.value) };
    }
}

export type FilterExprFieldNode = Extract<FilterExpr, { field: FilterField; value: FilterControl }>;
export type FilterExprFilterListNode = Extract<FilterExpr, { filters: FilterExpr[] }>;
export type FilterExprNotNode = Extract<FilterExpr, { filter: FilterExpr }>;

// Recursively get all field nodes from a FilterExpr tree
export function getFieldNodes(expr: FilterExpr): FilterExprFieldNode[] {
    const nodes: FilterExprFieldNode[] = [];
    if (isLeaf(expr)) {
        nodes.push(expr);
    } else if (expr.type === 'and' || expr.type === 'or') {
        for (const filter of expr.filters) {
            nodes.push(...getFieldNodes(filter));
        }
    } else if (expr.type === 'not') {
        nodes.push(...getFieldNodes(expr.filter));
    }
    return nodes;
}



export type FilterFieldGroup = {
    name: string;
    label: string | null;
};

export type FilterSchema = {
    id: string; // unique identifier for the filter
    label: string;
    expression: FilterExpr;
    group: string; // group name
    aiGenerated: boolean;
};

export type FilterId = FilterSchema['id'];

export type FilterSchemasAndGroups = {
    groups: FilterFieldGroup[];
    filters: FilterSchema[];
};

/**
 * Attempts to deserialize a plain JSON object into a FilterExpr.
 * Does not support custom filters or transformation functions.
 */
export function filterExprFromJSON(json: any): FilterExpr | null {
    if (!json || typeof json !== 'object' || !json.type) return null;
    switch (json.type) {
        case 'equals':
        case 'notEquals':
        case 'greaterThan':
        case 'lessThan':
        case 'greaterThanOrEqual':
        case 'lessThanOrEqual':
        case 'in':
        case 'notIn':
        case 'like':
        case 'iLike':
        case 'isNull': {
            // Only support basic FilterControl types (text, number, date, dropdown, multiselect)
            if (!json.field || !json.value || typeof json.value !== 'object' || !json.value.type) return null;
            const allowedTypes = ['text', 'number', 'date', 'dropdown', 'multiselect', 'autocomplete'];
            if (!allowedTypes.includes(json.value.type)) return null;
            return {
                type: json.type,
                field: json.field,
                value: json.value
            } as FilterExpr;
        }
        case 'and':
        case 'or': {
            if (!Array.isArray(json.filters)) return null;
            const children = json.filters.map(filterExprFromJSON).filter(Boolean) as FilterExpr[];
            return { type: json.type, filters: children };
        }
        case 'not': {
            if (!json.filter) return null;
            const child = filterExprFromJSON(json.filter);
            if (!child) return null;
            return { type: 'not', filter: child };
        }
        default:
            return null;
    }
}

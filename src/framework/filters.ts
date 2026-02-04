import * as React from 'react';
import { GraphQLClient } from 'graphql-request';
import { HasuraCondition } from './hasura';

// Multi-field specification
export type FilterField =
    | string  // Single field: "name" or "user.email"
    | { and: string[] }  // AND multiple fields: { and: ["name", "title", "description"] }
    | { or: string[] }  // OR multiple fields: { or: ["name", "title", "description"] }
    ;

// Transform result type - must return an object with optional field/value fields
export type TransformResult =
    | { field?: FilterField; value?: unknown }
    | { condition: HasuraCondition };

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
    | {
        type: 'autocomplete';
        label?: string;
        placeholder?: string;
        initialValue?: any;
        suggestionFetcher: SuggestionFetcher,
        queryMinLength?: number,
        suggestionLabelField?: string,
        multiple?: boolean,
        selectionLimit?: number
    }
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

export type SuggestionItem = { label: string };
export type SuggestionFetcher = (query: string, client: GraphQLClient) => Promise<SuggestionItem[]>

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

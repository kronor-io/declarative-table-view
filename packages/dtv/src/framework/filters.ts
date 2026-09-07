import * as React from 'react';
import { GraphQLClient } from 'graphql-request';
import type { FieldPath } from '@kronor/hasura-graphql';
import { HasuraFilterExpression } from './graphql';
import * as FilterValue from './filterValue';

// Multi-field specification
export type FilterField =
    | string  // Single field: "name" or "user.email"
    | { and: string[] }  // AND multiple fields: { and: ["name", "title", "description"] }
    | { or: string[] }  // OR multiple fields: { or: ["name", "title", "description"] }
    ;

/**
 * `FilterField` narrowed to the paths of a known row. `Row` is often not known
 * — a runtime's `queryTransforms`, a JSON view — and then this is `FilterField`
 * unchanged.
 */
export type FilterFieldForRow<Row> = unknown extends Row
    ? FilterField
    : | FieldPath<Row>
    | { and: FieldPath<Row>[] }
    | { or: FieldPath<Row>[] }
    // Used by FilterExpr.computedCondition(); doesn't map to row fields.
    | { or: [] };

// Transform result type - must return an object with optional field/value fields
export type TransformResult =
    | { field?: FilterField; value: FilterValue.FilterValue }
    | { condition: HasuraFilterExpression };

export const TransformResult = {
    empty: (): Extract<TransformResult, { value: FilterValue.FilterValue }> => ({
        value: FilterValue.empty,
    }),
    filterValue: (
        value: FilterValue.FilterValue
    ): Extract<TransformResult, { value: FilterValue.FilterValue }> => ({
        value,
    }),
    value: (value: unknown): Extract<TransformResult, { value: FilterValue.FilterValue }> => ({
        value: FilterValue.value(value),
    }),
    fieldValue: (
        field: FilterField,
        value: unknown
    ): Extract<TransformResult, { field?: FilterField; value: FilterValue.FilterValue }> => ({
        field,
        value: FilterValue.value(value),
    }),
    condition: (condition: HasuraFilterExpression): Extract<TransformResult, { condition: HasuraFilterExpression }> => ({
        condition,
    }),
} as const;

// Alias for the TransformResult variant that yields a full Hasura condition.
// Useful for helpers that *require* a condition-producing transform.
export type TransformConditionResult = Extract<TransformResult, { condition: HasuraFilterExpression }>;


/**
 * The `TransformResult` builders, with `fieldValue` restricted to the row a
 * transform is filtering. Handed to transforms on their context, so redirecting
 * a filter to another field is checked the same way the filter's own `field`
 * is.
 */
export type TransformResultForRow<Row> = Omit<typeof TransformResult, 'fieldValue'> & {
    fieldValue: (
        field: FilterFieldForRow<Row>,
        value: unknown
    ) => Extract<TransformResult, { field?: FilterField; value: FilterValue.FilterValue }>;
};

/**
 * What a transform is told about the filter it belongs to.
 *
 * `Row` and `Field` are filled in by the DSL from the leaf being built, so
 * `context.field` is the very path the filter declares and
 * `context.result.fieldValue` only accepts paths of the row. Both default to
 * unknown for transforms declared away from a filter, such as a runtime's
 * `queryTransforms`.
 */
export type QueryTransformContext<Row = unknown, Field extends FilterField = FilterField> = {
    field: Field;
    // The FilterValue namespace, exposed so transform authors can build/inspect
    // filter values without importing the module directly.
    FilterValue: typeof FilterValue;
    // The TransformResult builders, likewise, and row-aware here.
    result: TransformResultForRow<Row>;
    // Built-in transforms available for composition inside custom transforms.
    transform: {
        hasuraCustomOperator: ConditionOnlyTransform;
    };
};

/**
 * `Input` is the value the filter's control produces. The DSL fills it in from
 * the control a leaf declares (see dsl/filterControl's `ControlValue`), so a
 * transform's `input` arrives typed instead of needing a cast; it defaults to
 * `unknown` for transforms declared away from a control.
 *
 * `Row` and `Field` reach the context, and default to `any` so that types which
 * merely *hold* a transform accept one written against a narrower context. For
 * the same reason a holder uses `FilterTransform<any>`: a transform taking a
 * narrower input is not assignable to one taking `unknown`, and the holder
 * cannot know which control it will end up next to.
 */
export type ConditionOnlyTransform<Input = unknown, Row = any, Field extends FilterField = any> = {
    toQuery: (input: Input, context: QueryTransformContext<Row, Field>) => TransformConditionResult;
};

// Transform functions for filter expressions
export type FilterTransform<Input = unknown, Row = any, Field extends FilterField = any> = {
    toQuery?: (input: Input, context: QueryTransformContext<Row, Field>) => TransformResult;
};

export type FilterControl =
    | { type: 'text'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'number'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'date'; label?: string; placeholder?: string; initialValue?: any, showTime?: boolean }
    | { type: 'dropdown'; label?: string; items: { label: string; value: any }[]; filterable?: boolean; initialValue?: any }
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

/**
 * `fieldLabel` is what the applied-filter pill shows in place of the field
 * path. Without it a filter whose transform owns the query has no way to read
 * nicely in the pill except by putting a display string in `field`, which the
 * row-typed checks then have to reject.
 */
export type FilterExpr =
    | { type: 'equals'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'notEquals'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'greaterThan'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'lessThan'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'greaterThanOrEqual'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'lessThanOrEqual'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'in'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'notIn'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'like'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'iLike'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'isNull'; field: FilterField; value: FilterControl; fieldLabel?: string; transform?: FilterTransform<any> }
    | { type: 'and'; filters: FilterExpr[] }
    | { type: 'or'; filters: FilterExpr[] }
    | { type: 'not'; filter: FilterExpr };

// Convenience list of common Hasura operator options for customOperator controls.
// customOperator values are not restricted to these; query transforms define semantics.
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
    { label: 'is null', value: '_isNull' }
];

export type SuggestionItem = { label: string };

/**
 * Suggestions reach the filter's transform as they come back from here — the
 * item type is preserved so a fetcher returning `{ label, value }` gives its
 * transform that shape rather than the bare `SuggestionItem`.
 */
export type SuggestionFetcher<Item extends SuggestionItem = SuggestionItem> =
    (query: string, client: GraphQLClient) => Promise<Item[]>

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
    aiGenerated: boolean;
};

export type FilterId = FilterSchema['id'];

export type FilterGroup = FilterFieldGroup & {
    filters: FilterSchema[];
};

export type FilterGroups = FilterGroup[];

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
                value: json.value,
                ...(typeof json.fieldLabel === 'string' ? { fieldLabel: json.fieldLabel } : {})
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

/**
 * DSL helpers for declaring columns in views.
 *
 * These helpers wrap the underlying tagged union types from the framework
 * and provide a concise, ergonomic way to build column definitions while
 * retaining full type safety.
 */
import {
    type FieldQuery,
    type TableColumnDefinition,
    type VirtualColumnDefinition,
    type CellRenderer,
    type Query,
    type OrderByConfig,
    type ValueQuery,
    type ObjectQuery,
    type ArrayQuery,
} from "../framework/column-definition";
import type { HasuraCondition } from '../framework/graphql';

/**
 * Creates a renderable table column definition.
 * Convenience wrapper that accepts raw string paths or FieldQuery objects.
 */
export function column(name: string, data: FieldQuery[], cellRenderer: CellRenderer): TableColumnDefinition {
    return {
        type: 'tableColumn',
        name,
        data,
        cellRenderer,
    };
}

/**
 * Creates a data-only virtual column definition. Convenience wrapper that
 * accepts raw string paths or FieldQuery objects.
 */
export function virtualColumn(data: FieldQuery[]): VirtualColumnDefinition {
    return {
        type: 'virtualColumn',
        data,
    };
}

/**
 * Creates a ValueQuery (scalar field) definition.
 */
export function valueQuery(fieldName: string, options?: { path?: string }): ValueQuery {
    return {
        type: 'valueQuery',
        field: fieldName,
        ...options,
    };
}

/**
 * Creates an ObjectQuery (nested object) with a selection set.
 * selectionSet must contain only Query variants (value/object/array queries).
 */
export function objectQuery(fieldName: string, selectionSet: Query[], options?: { path?: string }): ObjectQuery {
    return {
        type: 'objectQuery',
        field: fieldName,
        selectionSet,
        ...options,
    };
}

/**
 * Creates an ArrayQuery (list) with a selection set and optional ordering/limit.
 */
export function arrayQuery(
    fieldName: string,
    selectionSet: Query[],
    options?: { path?: string; orderBy?: OrderByConfig | OrderByConfig[]; distinctOn?: string[]; limit?: number; where?: HasuraCondition }
): ArrayQuery {
    return {
        type: 'arrayQuery',
        field: fieldName,
        selectionSet,
        ...options,
    };
}

// Convenience re-export of Query type for selectionSet construction in user code.
export type { Query };

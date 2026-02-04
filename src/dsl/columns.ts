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
export function column(args: { id: string; name: string; data: FieldQuery[]; cellRenderer: CellRenderer }): TableColumnDefinition {
    return {
        type: 'tableColumn',
        id: args.id,
        name: args.name,
        data: args.data,
        cellRenderer: args.cellRenderer,
    };
}

/**
 * Creates a data-only virtual column definition. Convenience wrapper that
 * accepts raw string paths or FieldQuery objects.
 */
export function virtualColumn(args: { id: string; data: FieldQuery[] }): VirtualColumnDefinition {
    return {
        type: 'virtualColumn',
        id: args.id,
        data: args.data,
    };
}

/**
 * Creates a ValueQuery (scalar field) definition.
 */
export function valueQuery(args: { field: string; path?: string }): ValueQuery {
    return {
        type: 'valueQuery',
        field: args.field,
        ...(args.path !== undefined ? { path: args.path } : {}),
    };
}

/**
 * Creates an ObjectQuery (nested object) with a selection set.
 * selectionSet must contain only Query variants (value/object/array queries).
 */
export function objectQuery(args: { field: string; selectionSet: Query[]; path?: string }): ObjectQuery {
    return {
        type: 'objectQuery',
        field: args.field,
        selectionSet: args.selectionSet,
        ...(args.path !== undefined ? { path: args.path } : {}),
    };
}

/**
 * Creates an ArrayQuery (list) with a selection set and optional ordering/limit.
 */
export function arrayQuery(args: {
    field: string;
    selectionSet: Query[];
    path?: string;
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraCondition;
}): ArrayQuery {
    return {
        type: 'arrayQuery',
        field: args.field,
        selectionSet: args.selectionSet,
        ...(args.path !== undefined ? { path: args.path } : {}),
        ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
        ...(args.distinctOn !== undefined ? { distinctOn: args.distinctOn } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.where !== undefined ? { where: args.where } : {}),
    };
}

// Convenience re-export of Query type for selectionSet construction in user code.
export type { Query };

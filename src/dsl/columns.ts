/**
 * DSL helpers for declaring columns in views.
 *
 * These helpers wrap the underlying tagged union types from the framework
 * and provide a concise, ergonomic way to build column definitions while
 * retaining full type safety.
 */
import {
    type FieldQuery,
    type DataFromFieldQueriesSafe,
    type DataFromFieldQueriesForRowSafe,
    type FieldQueryForRowSafe,
    type TableColumnDefinition,
    type VirtualColumnDefinition,
    type CellRenderer,
    type Query,
    type OrderByConfig,
    type ValueQuery,
    type ObjectQuery,
    type ArrayQuery,
} from "../framework/column-definition";
import type { HasuraFilterExpression } from '../framework/graphql';

/**
 * Produces a phantom value used for type inference.
 *
 * Typical usage:
 *
 *   column({
 *     rowType: rowType<MyFullRow>(),
 *     ...
 *   })
 */
export function rowType<Row>(): Row {
    return undefined as unknown as Row;
}

/**
 * Creates a renderable table column definition.
 * Convenience wrapper around the underlying TableColumnDefinition type.
 */
export function column<Row, const FieldQueries extends readonly FieldQuery[]>(args: {
    // Phantom type-only field used for inference; not included in the returned column definition.
    rowType: Row;
    id: string;
    name: string;
    data: FieldQueries & readonly FieldQueryForRowSafe<Row>[];
    cellRenderer: CellRenderer<DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
}): TableColumnDefinition<FieldQueries, DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
export function column<const FieldQueries extends readonly FieldQuery[]>(args: {
    rowType?: never;
    id: string;
    name: string;
    data: FieldQueries;
    cellRenderer: CellRenderer<DataFromFieldQueriesSafe<FieldQueries>>;
}): TableColumnDefinition<FieldQueries>;
export function column(args: {
    rowType?: unknown;
    id: string;
    name: string;
    data: readonly FieldQuery[];
    cellRenderer: CellRenderer<Record<string, any>>;
}): TableColumnDefinition {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowType, ...rest } = args;
    return {
        type: 'tableColumn',
        id: rest.id,
        name: rest.name,
        data: rest.data,
        cellRenderer: rest.cellRenderer,
    };
}

/**
 * Creates a data-only virtual column definition. Convenience wrapper around
 * the underlying VirtualColumnDefinition type.
 */
export function virtualColumn<const FieldQueries extends readonly FieldQuery[]>(args: { id: string; data: FieldQueries }): VirtualColumnDefinition<FieldQueries> {
    return {
        type: 'virtualColumn',
        id: args.id,
        data: args.data,
    };
}

/**
 * Creates a ValueQuery (scalar field) definition.
 */
export function valueQuery<const Field extends string>(args: { field: Field; path?: string }): ValueQuery & { field: Field } {
    return {
        type: 'valueQuery',
        field: args.field,
        ...(args.path !== undefined ? { path: args.path } : {}),
    } as ValueQuery & { field: Field };
}

/**
 * Creates an ObjectQuery (nested object) with a selection set.
 * selectionSet must contain only Query variants (value/object/array queries).
 */
export function objectQuery<const Field extends string, const SelectionSet extends readonly Query[]>(args: {
    field: Field;
    selectionSet: SelectionSet;
    path?: string;
}): ObjectQuery & { field: Field; selectionSet: SelectionSet } {
    return {
        type: 'objectQuery',
        field: args.field,
        selectionSet: args.selectionSet,
        ...(args.path !== undefined ? { path: args.path } : {}),
    } as ObjectQuery & { field: Field; selectionSet: SelectionSet };
}

/**
 * Creates an ArrayQuery (list) with a selection set and optional ordering/limit.
 */
export function arrayQuery<const Field extends string, const SelectionSet extends readonly Query[]>(args: {
    field: Field;
    selectionSet: SelectionSet;
    path?: string;
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraFilterExpression;
}): ArrayQuery & { field: Field; selectionSet: SelectionSet };

export function arrayQuery(args: {
    field: string;
    selectionSet: readonly Query[];
    path?: string;
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraFilterExpression;
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
    } as ArrayQuery;
}

// Convenience re-export of Query type for selectionSet construction in user code.
export type { Query } from "../framework/column-definition";

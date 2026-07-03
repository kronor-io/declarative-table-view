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
    type OrderableFieldPath,
    type Query,
    type OrderByConfig,
    type TableColumnDefinitionFooter,
    type ValueQuery,
    type ObjectQuery,
    type ArrayQuery,
    orderByIsSelectedField,
} from "../framework/column-definition";
import type { HasuraFilterExpression } from '../framework/graphql';

type WithOptionalPath<Path extends string | undefined> = Path extends string
    ? { path: Path }
    : { path?: undefined };

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
    footer?: TableColumnDefinitionFooter;
    orderBy?: OrderableFieldPath<FieldQueries>;
    cellRenderer: CellRenderer<DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
}): TableColumnDefinition<FieldQueries, DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
export function column<const FieldQueries extends readonly FieldQuery[]>(args: {
    rowType?: never;
    id: string;
    name: string;
    data: FieldQueries;
    footer?: TableColumnDefinitionFooter;
    orderBy?: OrderableFieldPath<FieldQueries>;
    cellRenderer: CellRenderer<DataFromFieldQueriesSafe<FieldQueries>>;
}): TableColumnDefinition<FieldQueries>;
export function column(args: {
    rowType?: unknown;
    id: string;
    name: string;
    data: readonly FieldQuery[];
    footer?: TableColumnDefinitionFooter;
    orderBy?: string;
    cellRenderer: CellRenderer<Record<string, any>>;
}): TableColumnDefinition {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowType, ...rest } = args;
    if (rest.orderBy !== undefined && !orderByIsSelectedField(rest.data, rest.orderBy)) {
        throw new Error(`Column "${rest.id}" orderBy "${rest.orderBy}" must reference a scalar field selected by the column data`);
    }

    return {
        type: 'tableColumn',
        id: rest.id,
        name: rest.name,
        data: rest.data,
        ...(rest.footer !== undefined ? { footer: rest.footer } : {}),
        ...(rest.orderBy !== undefined ? { orderBy: rest.orderBy } : {}),
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
export function valueQuery<const Field extends string, const Path extends string | undefined = undefined>(args: { field: Field; path?: Path }): ValueQuery & { field: Field } & WithOptionalPath<Path> {
    return {
        type: 'valueQuery',
        field: args.field,
        ...(args.path !== undefined ? { path: args.path } : {}),
    } as unknown as ValueQuery & { field: Field } & WithOptionalPath<Path>;
}

/**
 * Creates an ObjectQuery (nested object) with a selection set.
 * selectionSet must contain only Query variants (value/object/array queries).
 */
export function objectQuery<const Field extends string, const SelectionSet extends readonly Query[], const Path extends string | undefined = undefined>(args: {
    field: Field;
    selectionSet: SelectionSet;
    path?: Path;
}): ObjectQuery & { field: Field; selectionSet: SelectionSet } & WithOptionalPath<Path> {
    return {
        type: 'objectQuery',
        field: args.field,
        selectionSet: args.selectionSet,
        ...(args.path !== undefined ? { path: args.path } : {}),
    } as unknown as ObjectQuery & { field: Field; selectionSet: SelectionSet } & WithOptionalPath<Path>;
}

/**
 * Creates an ArrayQuery (list) with a selection set and optional ordering/limit.
 */
export function arrayQuery<const Field extends string, const SelectionSet extends readonly Query[], const Path extends string | undefined = undefined>(args: {
    field: Field;
    selectionSet: SelectionSet;
    path?: Path;
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraFilterExpression;
}): ArrayQuery & { field: Field; selectionSet: SelectionSet } & WithOptionalPath<Path>;

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

/**
 * DSL helpers for declaring columns in views.
 *
 * These helpers wrap the underlying tagged union types from the framework
 * and provide a concise, ergonomic way to build column definitions while
 * retaining full type safety.
 *
 * The query builders themselves (`valueQuery` / `objectQuery` / `arrayQuery`)
 * and `rowType` come from @kronor/hasura-graphql and are re-exported here so
 * view authors have a single import site.
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
    type TableColumnDefinitionFooter,
    orderByIsSelectedField,
} from "../framework/column-definition";

export { valueQuery, objectQuery, arrayQuery, rowType } from "@kronor/hasura-graphql";

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

// Convenience re-export of Query type for selectionSet construction in user code.
export type { Query } from "../framework/column-definition";

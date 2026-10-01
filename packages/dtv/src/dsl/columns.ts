/**
 * DSL helpers for declaring columns in views.
 *
 * These helpers wrap the underlying tagged union types from the framework
 * and provide a concise, ergonomic way to build column definitions while
 * retaining full type safety.
 *
 * Every column is declared against the view's row type (`rowType`): the
 * fields it selects have to exist on the row, and its renderer sees them with
 * the row's own types, nullability included. A column shared between views
 * that takes its field from the caller is built with `fieldColumn`, which
 * checks that field against the caller's row.
 *
 * The query builders themselves (`valueQuery` / `objectQuery` / `arrayQuery`)
 * and `rowType` come from @kronor/hasura-graphql and are re-exported here so
 * view authors have a single import site.
 */
import type { ReactNode } from "react";
import { arrayQuery, objectQuery, valueQuery, type Query } from "@kronor/hasura-graphql";
import {
    type FieldQuery,
    type DataFromFieldQueriesForRowSafe,
    type FieldQueryForRowSafe,
    type TableColumnDefinition,
    type VirtualColumnDefinition,
    type CellRenderer,
    type CellRendererProps,
    type OrderableFieldPath,
    type TableColumnDefinitionFooter,
    orderByIsSelectedField,
} from "../framework/column-definition";
import type {
    ColumnFieldValue,
    FieldColumnOrderBy,
    FieldColumnSelect,
    FieldSelection,
    ValidateColumnFieldType,
} from "./columnTyping";

export { valueQuery, objectQuery, arrayQuery, rowType } from "@kronor/hasura-graphql";

function tableColumn(args: {
    id: string;
    name: string;
    data: readonly FieldQuery[];
    footer?: TableColumnDefinitionFooter;
    orderBy?: string;
    cellRenderer: CellRenderer<Record<string, any>>;
}): TableColumnDefinition {
    if (args.orderBy !== undefined && !orderByIsSelectedField(args.data, args.orderBy)) {
        throw new Error(`Column "${args.id}" orderBy "${args.orderBy}" must reference a scalar field selected by the column data`);
    }

    return {
        type: 'tableColumn',
        id: args.id,
        name: args.name,
        data: args.data,
        ...(args.footer !== undefined ? { footer: args.footer } : {}),
        ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
        cellRenderer: args.cellRenderer,
    };
}

/**
 * Creates a renderable table column definition for a view over `Row`.
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
export function column(args: Parameters<typeof tableColumn>[0] & { rowType: unknown }): TableColumnDefinition {
    return tableColumn(args);
}

/** The props a `fieldColumn` renderer gets: the usual ones, plus the field's value. */
export type FieldCellRendererProps<Value> = CellRendererProps & { value: Value };

// Not bivariant like `CellRenderer`: `fieldColumn` wraps the renderer, so it never has to fit a
// wider container, and bivariance would let a renderer that ignores null take a nullable field.
type FieldCellRenderer<Value> = (props: FieldCellRendererProps<Value>) => ReactNode;

const readPath = (data: Record<string, unknown>, path: readonly string[]): unknown => {
    let value: unknown = data;
    for (const segment of path) {
        if (value === null || value === undefined) return null;
        value = (value as Record<string, unknown>)[segment];
    }
    return value ?? null;
};

/**
 * A column showing one field of the row, given as a (dotted) path — for a
 * column shared between views that takes its field from the caller:
 *
 *     function accountColumn<Row, const Field extends string>(
 *         rowType: Row,
 *         field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
 *         name: string,
 *     ) {
 *         return fieldColumn({
 *             rowType,
 *             field,
 *             name,
 *             select: { object: [valueQuery({ field: 'accountNr' })] },
 *             cellRenderer: ({ value }) => value?.accountNr ?? null,
 *         });
 *     }
 *
 * The renderer gets the field's value as `value` (null when the field is
 * missing, or an object on the path is null or missing). Its type is the one
 * the renderer declares, which is what the field is checked against, so a
 * renderer that does not handle null only accepts fields that cannot be null.
 * A renderer that declares nothing gets the field's own type — inside a helper
 * like the one above, the type its field was checked against (`Account | null`). What is
 * selected inside the field follows from that type: nothing for a scalar,
 * `select: { object: [...] }` for an object, `select: { list: [...] }` for a
 * list, each checked against it. `orderBy` names the field itself for a
 * scalar, or a scalar inside it for an object.
 *
 * See ./columnTyping for how a helper's own field is checked.
 */
export function fieldColumn<Row, const Field extends string, Value = ColumnFieldValue<Row, Field>>(
    args: {
        rowType: Row;
        // Value comes from the renderer, else from the brand of a field a helper hands on, else
        // defaults to the field's own type; never from the rest.
        field: Field & ValidateColumnFieldType<Row, Field, Value>;
        id?: string;
        name: string;
        footer?: TableColumnDefinitionFooter;
        orderBy?: NoInfer<FieldColumnOrderBy<Field, Value>>;
        cellRenderer: FieldCellRenderer<Value>;
    } & NoInfer<FieldColumnSelect<Value>>,
): TableColumnDefinition {
    const field: string = args.field;
    const path = field.split('.');
    const leafField = path[path.length - 1];
    const select = args.select as FieldSelection | undefined;

    let query: Query;
    if (select === undefined) {
        query = valueQuery({ field: leafField });
    } else if ('object' in select) {
        query = objectQuery({ field: leafField, selectionSet: select.object });
    } else {
        const { list, ...listArgs } = select;
        query = arrayQuery({ field: leafField, selectionSet: list, ...listArgs });
    }
    for (const segment of path.slice(0, -1).reverse()) {
        query = objectQuery({ field: segment, selectionSet: [query] });
    }

    const render = args.cellRenderer;
    return tableColumn({
        id: args.id ?? field,
        name: args.name,
        data: [query],
        ...(args.footer !== undefined ? { footer: args.footer } : {}),
        ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
        // The query above selects exactly the checked path, so the value read back is a `Value`.
        cellRenderer: props => render({ ...props, value: readPath(props.data, path) as Value }),
    });
}

/**
 * Creates a data-only virtual column definition for a view over `Row`.
 * Convenience wrapper around the underlying VirtualColumnDefinition type.
 */
export function virtualColumn<Row, const FieldQueries extends readonly FieldQuery[]>(args: {
    // Phantom type-only field used for inference; not included in the returned column definition.
    rowType: Row;
    id: string;
    data: FieldQueries & readonly FieldQueryForRowSafe<Row>[];
}): VirtualColumnDefinition<FieldQueries> {
    return {
        type: 'virtualColumn',
        id: args.id,
        data: args.data,
    };
}

// Convenience re-export of Query type for selectionSet construction in user code.
export type { Query } from "../framework/column-definition";

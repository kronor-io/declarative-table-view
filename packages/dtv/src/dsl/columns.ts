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
    type FooterRenderer,
    type TableColumnDefinitionFooter,
} from "../framework/column-definition";
import type { AggregateDefinitions, AggregateStates } from "../framework/aggregates";
import * as Orderable from "../framework/orderable";
import type {
    ColumnFieldValue,
    FieldColumnData,
    FieldColumnOrderBy,
    FieldColumnSelect,
    FieldSelection,
    ValidateColumnFieldType,
} from "./columnTyping";

export { valueQuery, objectQuery, arrayQuery, rowType } from "@kronor/hasura-graphql";

/**
 * `orderBy: Orderable.notOrderable` declares a column that cannot be sorted. Without it, a
 * column whose data is a single scalar field is sorted by that field — also when sorting by
 * it is useless, as for a JSON field.
 */
export * as Orderable from "../framework/orderable";

function tableColumn(args: {
    id: string;
    name: string;
    data: readonly FieldQuery[];
    footer?: TableColumnDefinitionFooter;
    aggregates?: AggregateDefinitions;
    footerRenderer?: FooterRenderer;
    orderBy?: string | Orderable.NotOrderable;
    cellRenderer: CellRenderer;
}): TableColumnDefinition {
    if (typeof args.orderBy === 'string' && !Orderable.orderByIsSelectedField(args.data, args.orderBy)) {
        throw new Error(`Column "${args.id}" orderBy "${args.orderBy}" must reference a scalar field selected by the column data`);
    }

    return {
        type: 'tableColumn',
        id: args.id,
        name: args.name,
        data: args.data,
        ...(args.footer !== undefined ? { footer: args.footer } : {}),
        ...(args.aggregates !== undefined ? { aggregates: args.aggregates } : {}),
        ...(args.footerRenderer !== undefined ? { footerRenderer: args.footerRenderer } : {}),
        ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
        cellRenderer: args.cellRenderer,
    };
}

/**
 * Creates a renderable table column definition for a view over `Row`.
 * Convenience wrapper around the underlying TableColumnDefinition type.
 *
 * `aggregates` are the view's aggregates the column reads, under the names the view gives
 * them (`aggregates: { totals }`); its `cellRenderer` and `footerRenderer` get their states.
 */
export function column<
    Row,
    const FieldQueries extends readonly FieldQuery[],
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no aggregates
    const Aggregates extends AggregateDefinitions = {},
>(args: {
    // Phantom type-only field used for inference; not included in the returned column definition.
    rowType: Row;
    id: string;
    name: string;
    data: FieldQueries & readonly FieldQueryForRowSafe<Row>[];
    footer?: TableColumnDefinitionFooter;
    aggregates?: Aggregates;
    footerRenderer?: FooterRenderer<AggregateStates<Aggregates>>;
    orderBy?: Orderable.OrderableFieldPath<FieldQueries> | Orderable.NotOrderable;
    cellRenderer: CellRenderer<DataFromFieldQueriesForRowSafe<Row, FieldQueries>, AggregateStates<Aggregates>>;
}): TableColumnDefinition<FieldQueries, DataFromFieldQueriesForRowSafe<Row, FieldQueries>, Aggregates>;
export function column(args: Parameters<typeof tableColumn>[0] & { rowType: unknown }): TableColumnDefinition {
    return tableColumn(args);
}

/** The props a `fieldColumn` renderer gets: the usual ones, plus the field's value. */
export type FieldCellRendererProps<Value, Aggregates extends object = AggregateStates> =
    CellRendererProps<Record<string, unknown>, Aggregates> & { value: Value };

// Not bivariant like `CellRenderer`: `fieldColumn` wraps the renderer, so it never has to fit a
// wider container, and bivariance would let a renderer that ignores null take a nullable field.
type FieldCellRenderer<Value, Aggregates extends object = AggregateStates> =
    (props: FieldCellRendererProps<Value, Aggregates>) => ReactNode;

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
 * scalar, or a scalar inside it for an object; `Orderable.notOrderable` keeps a scalar
 * field's column from being sorted by it.
 *
 * The column puts the field on the row DTV hands out (`SimplifiedRow`) with the type
 * its renderer takes.
 *
 * See ./columnTyping for how a helper's own field is checked.
 */
export function fieldColumn<
    Row,
    const Field extends string,
    Value = ColumnFieldValue<Row, Field>,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no aggregates
    const Aggregates extends AggregateDefinitions = {},
>(
    args: {
        rowType: Row;
        // Value comes from the renderer, else from the brand of a field a helper hands on, else
        // defaults to the field's own type; never from the rest.
        field: Field & ValidateColumnFieldType<Row, Field, Value>;
        id?: string;
        name: string;
        footer?: TableColumnDefinitionFooter;
        aggregates?: Aggregates;
        footerRenderer?: FooterRenderer<AggregateStates<Aggregates>>;
        orderBy?: NoInfer<FieldColumnOrderBy<Field, Value>> | Orderable.NotOrderable;
        cellRenderer: FieldCellRenderer<Value, AggregateStates<NoInfer<Aggregates>>>;
    } & NoInfer<FieldColumnSelect<Value>>,
    // NoInfer: Value is decided by the arguments, never by where the column goes
): TableColumnDefinition<readonly FieldQuery[], FieldColumnData<Row, Field, NoInfer<Value>>, Aggregates> {
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
        ...(args.aggregates !== undefined ? { aggregates: args.aggregates } : {}),
        ...(args.footerRenderer !== undefined ? { footerRenderer: args.footerRenderer as FooterRenderer } : {}),
        ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
        // The query above selects exactly the checked path, so the value read back is a `Value`.
        cellRenderer: props => render({
            ...props,
            aggregates: props.aggregates as AggregateStates<Aggregates>,
            value: readPath(props.data, path) as Value
        }),
    }) as TableColumnDefinition<readonly FieldQuery[], FieldColumnData<Row, Field, NoInfer<Value>>, Aggregates>;
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
}): VirtualColumnDefinition<FieldQueries, DataFromFieldQueriesForRowSafe<Row, FieldQueries>> {
    return {
        type: 'virtualColumn',
        id: args.id,
        data: args.data,
    };
}

// Convenience re-export of Query type for selectionSet construction in user code.
export type { Query } from "../framework/column-definition";

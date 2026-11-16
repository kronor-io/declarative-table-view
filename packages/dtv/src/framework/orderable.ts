/**
 * How a column is ordered when its header is sorted, imported as a namespace:
 * `orderBy: Orderable.notOrderable`, `Orderable.getColumnOrderBy(column)`.
 *
 * A column's `orderBy` names the GraphQL field it orders by. Left out, a column whose data
 * is a single scalar field orders by that field; `notOrderable` is how a column says it
 * cannot be sorted at all.
 *
 * Which paths a selection can be ordered by is a property of the query AST, so those
 * helpers are defined in @kronor/hasura-graphql and re-exported here.
 */
import { getFieldQueriesOrderBy, orderByIsSelectedField } from "@kronor/hasura-graphql";
import type { TableColumnDefinition } from "./column-definition";

export type { OrderableFieldPath } from "@kronor/hasura-graphql";
export { getOrderableFieldPaths, orderByIsSelectedField } from "@kronor/hasura-graphql";

export const notOrderable: { readonly type: "notOrderable" } = Object.freeze({ type: "notOrderable" });

export type NotOrderable = typeof notOrderable;

// By tag rather than identity, so a value that went through JSON still counts.
export function isNotOrderable(orderBy: unknown): orderBy is NotOrderable {
    return typeof orderBy === "object" && orderBy !== null && (orderBy as { type?: unknown }).type === "notOrderable";
}

/** The field a column orders by when its header is sorted, or undefined when it cannot be sorted. */
export function getColumnOrderBy(column: TableColumnDefinition): string | undefined {
    if (isNotOrderable(column.orderBy)) {
        return undefined;
    }

    if (column.orderBy !== undefined) {
        if (!orderByIsSelectedField(column.data, column.orderBy)) {
            throw new Error(`Column "${column.id}" orderBy "${column.orderBy}" must reference a scalar field selected by the column data`);
        }

        return column.orderBy;
    }

    return getFieldQueriesOrderBy(column.data);
}

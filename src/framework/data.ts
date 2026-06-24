import { GraphQLClient } from 'graphql-request';
import { buildHasuraConditions, Hasura, hasuraFilterExpressionToObject, HasuraOrderBy } from '../framework/graphql';
import { getViewRootFieldName, View } from '../framework/view';
import type { ColumnDefinition, ColumnId, FieldQuery } from '../framework/column-definition';
import { FilterState } from './state';

export type FlattenedDataRow = Record<ColumnId, Record<string, unknown>>;

export interface FetchDataResult {
    rows: Record<string, unknown>[]; // Fetched rows from the query
    flattenedRows: FlattenedDataRow[]; // Rows flattened according to column definitions
}

export type PaginationCursor = Record<string, unknown> | null;

type PaginationOrdering = {
    field: string;
    direction: 'ASC' | 'DESC';
};

function hasKey<K extends string | number | symbol, T extends { [key in K]: unknown[] }>(obj: unknown, key: K): obj is T {
    return typeof obj === 'object' && obj !== null && key in obj && Array.isArray((obj as T)[key]);
}

// Request counter to be able to cancel handling of previous requests
let requestCounter = 0;

// Helper to build the GraphQL variables object for a data fetch.
// Extracted from fetchData for reuse (e.g., custom actions, debugging, or tests).
// It composes:
//  - conditions: user filter conditions merged with staticConditions (if any)
//  - paginationCondition: isolated cursor condition so the cursor value is parameterized separately
//  - rowLimit: result size cap
//  - orderBy: static ordering followed by a unique paginationKey tie-breaker
function getPaginationOrderings(view: View): PaginationOrdering[] {
    const staticOrderings = view.staticOrdering ?? [];
    const orderings = staticOrderings.flatMap(ordering =>
        Object.entries(ordering).map(([field, direction]) => ({ field, direction }))
    );
    const hasPaginationKeyOrdering = orderings.some(ordering => ordering.field === view.paginationKey);

    if (!hasPaginationKeyOrdering) {
        orderings.push({
            field: view.paginationKey,
            direction: view.paginationDirection ?? 'DESC'
        });
    }

    return orderings;
}

function getCursorValue(cursor: PaginationCursor, field: string): unknown {
    if (cursor === null) return undefined;
    if (!(field in cursor)) {
        throw new Error(`Cannot build pagination cursor: missing value for ordered field "${field}"`);
    }
    return cursor[field];
}

function buildCursorEqualityCondition(ordering: PaginationOrdering, cursor: PaginationCursor) {
    const cursorValue = getCursorValue(cursor, ordering.field);

    return cursorValue === null
        ? Hasura.condition(ordering.field, Hasura.isNull(true))
        : Hasura.condition(ordering.field, Hasura.eq(cursorValue));
}

function buildCursorAfterCondition(ordering: PaginationOrdering, cursor: PaginationCursor) {
    const cursorValue = getCursorValue(cursor, ordering.field);

    // Hasura/Postgres comparisons do not support keyset boundaries like _lt/_gt: null.
    // For plain ASC/DESC ordering, Hasura follows Postgres' default null placement:
    // ASC puts nulls last, DESC puts nulls first. Encode those page boundaries with
    // isNull checks instead of comparing against null directly.
    if (cursorValue === null) {
        return ordering.direction === 'DESC'
            ? Hasura.condition(ordering.field, Hasura.isNull(false))
            : null;
    }

    if (ordering.direction === 'ASC') {
        return Hasura.or(
            Hasura.condition(ordering.field, Hasura.gt(cursorValue)),
            Hasura.condition(ordering.field, Hasura.isNull(true))
        );
    }

    return Hasura.condition(ordering.field, Hasura.lt(cursorValue));
}

function buildImpossibleCondition(view: View) {
    return Hasura.and(
        Hasura.condition(view.paginationKey, Hasura.isNull(true)),
        Hasura.condition(view.paginationKey, Hasura.isNull(false))
    );
}

function buildPaginationCondition(view: View, cursor: PaginationCursor) {
    if (cursor === null) return Hasura.empty();

    const orderings = getPaginationOrderings(view);
    const branches = orderings.flatMap((ordering, index) => {
        const afterCondition = buildCursorAfterCondition(ordering, cursor);
        // A null ASC cursor is already in the final null segment for this field, so
        // there is no "after" branch at this level. Later tie-breaker fields may
        // still produce branches while previous fields stay equal.
        if (afterCondition === null) return [];

        const equalityConditions = orderings.slice(0, index).map(previousOrdering =>
            buildCursorEqualityCondition(previousOrdering, cursor)
        );

        return [Hasura.and(
            ...equalityConditions,
            afterCondition
        )];
    });

    if (branches.length === 0) {
        // Returning an empty pagination condition would mean "no cursor" and fetch the
        // first page again. When the cursor is already at the end of the ordered keyspace,
        // return a valid boolean expression that cannot match any row instead.
        return buildImpossibleCondition(view);
    }

    return Hasura.or(...branches);
}

function buildOrderBy(view: View): HasuraOrderBy[] {
    return getPaginationOrderings(view).map(ordering => ({ [ordering.field]: ordering.direction }));
}

export function getPaginationOrderFieldQueries(view: View): FieldQuery[] {
    const fields = new Set(getPaginationOrderings(view).map(ordering => ordering.field));
    fields.delete(view.paginationKey);

    return Array.from(fields).map(field => ({ type: 'valueQuery', field }));
}

export const buildGraphQLQueryVariables = (
    view: View,
    filterState: FilterState,
    rowLimit: number,
    cursor: PaginationCursor
) => {
    let conditionsExpr = buildHasuraConditions(filterState, view.filterGroups);

    if (view.staticConditions && view.staticConditions.length > 0) {
        conditionsExpr = Hasura.and(conditionsExpr, ...view.staticConditions);
    }

    const paginationConditionExpr = buildPaginationCondition(view, cursor);
    const orderBy = buildOrderBy(view);

    return {
        conditions: hasuraFilterExpressionToObject(conditionsExpr),
        paginationCondition: hasuraFilterExpressionToObject(paginationConditionExpr),
        rowLimit,
        orderBy
    };
};

export const fetchData = async ({
    client,
    view,
    query,
    filterState,
    rowLimit,
    cursor
}: {
    client: GraphQLClient;
    view: View;
    query: string;
    filterState: FilterState;
    rowLimit: number;
    cursor: PaginationCursor;
}): Promise<FetchDataResult> => {
    // Assign a unique ID to this request for ordering
    const currentRequestId = ++requestCounter;

    try {
        const variables = buildGraphQLQueryVariables(view, filterState, rowLimit, cursor);

        const response = await client.request(query, variables);

        // Check if this is still the most recent request
        if (currentRequestId !== requestCounter) {
            // A newer request has been started, discard this response
            throw new DOMException('Request superseded by newer request', 'AbortError');
        }

        const rootFieldName = getViewRootFieldName(view);

        if (!hasKey(response, rootFieldName)) {
            console.error('Error fetching data, unexpected response format:', response);
            return { rows: [], flattenedRows: [] };
        }

        const rowsFetched = response[rootFieldName];

        // Flatten the data before returning
        return {
            rows: rowsFetched as Record<string, unknown>[],
            flattenedRows: flattenFields(rowsFetched as Record<string, unknown>[], view.columnDefinitions)
        }
    } catch (error) {
        // Don't log AbortError as it's expected when cancelling requests
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error; // Re-throw abort errors so fetchDataWrapper can cancel response handling
        }
        console.error('Error fetching data:', error);
        return { rows: [], flattenedRows: [] };
    }
};

// Applies flattenColumnFields to all rows for all columns
export const flattenFields = (
    rows: Record<string, unknown>[],
    columns: ColumnDefinition[]
): FlattenedDataRow[] => {
    return rows.map(row => {
        return Object.fromEntries(
            columns.map(column => [column.id, flattenColumnFields(row, column)])
        ) as FlattenedDataRow;
    });
};

export const flattenFieldQueries = (row: Record<string, unknown>, fieldQueries: readonly FieldQuery[]) => {
    // Build a per-column cell data object that includes ONLY the fields requested
    // by the column's FieldQuery definitions. We preserve nested object structure
    // (customer.name -> { customer: { name } }) but do not create dot-key strings.
    // For queries that target nested paths we currently copy the entire nested
    // object at the root level (e.g. both customer.name and customer.email simply
    // copy row.customer). This keeps renderers that expect combined nested data working.
    // For alias fields we prefer the alias value already present in the row (as returned
    // by GraphQL). If missing, we derive it from the underlying field query.

    const cellData: Record<string, unknown> = {};

    function getUnderlyingValue(fq: FieldQuery): unknown {
        switch (fq.type) {
            case 'fieldAlias': {
                // Prefer alias value if already present
                if (row[fq.alias] !== undefined) return row[fq.alias];
                return getUnderlyingValue(fq.field);
            }
            case 'valueQuery':
            case 'objectQuery':
            case 'arrayQuery':
                return row[fq.field];
            default:
                return undefined;
        }
    }

    function processFieldQuery(fq: FieldQuery) {
        if (fq.type === 'fieldAlias') {
            const alias = fq.alias;
            if (row[alias] !== undefined) {
                cellData[alias] = row[alias];
            } else {
                const derived = getUnderlyingValue(fq.field);
                if (derived !== undefined) cellData[alias] = derived;
            }
            return;
        }
        if (fq.type === 'valueQuery' || fq.type === 'objectQuery' || fq.type === 'arrayQuery') {
            if (row[fq.field] !== undefined) {
                cellData[fq.field] = row[fq.field];
            }
        }
    }

    fieldQueries.forEach(processFieldQuery);
    return cellData;
};

// Helper to extract field values for a column from a row
export const flattenColumnFields = (row: Record<string, unknown>, column: ColumnDefinition) => {
    return flattenFieldQueries(row, column.data);
};

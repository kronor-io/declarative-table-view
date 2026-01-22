import { GraphQLClient } from 'graphql-request';
import { buildHasuraConditions, HasuraOrderBy } from '../framework/graphql';
import { View } from '../framework/view';
import type { ColumnDefinition, ColumnId } from '../framework/column-definition';
import { FilterState } from './state';

export type FlattenedDataRow = Record<ColumnId, Record<string, any>>;

export interface FetchDataResult {
    rows: Record<string, unknown>[]; // Fetched rows from the query
    flattenedRows: FlattenedDataRow[]; // Rows flattened according to column definitions
}

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
//  - orderBy: descending on the view.paginationKey (matches existing pagination behavior)
export const buildGraphQLQueryVariables = (
    view: View,
    filterState: FilterState,
    rowLimit: number,
    cursor: string | number | null
) => {
    let conditions = buildHasuraConditions(filterState, view.filterSchema);

    if (view.staticConditions && view.staticConditions.length > 0) {
        // Wrap even when user conditions object is empty for consistent shape
        conditions = { _and: [conditions, ...view.staticConditions] };
    }

    const paginationCondition = cursor !== null
        ? { [view.paginationKey]: { _lt: cursor } }
        : {}; // Empty object becomes a no-op inside an _and

    const paginationOrdering: HasuraOrderBy = { [view.paginationKey]: 'DESC' };
    const orderBy: HasuraOrderBy[] = (view.staticOrdering && view.staticOrdering.length > 0)
        ? [paginationOrdering, ...view.staticOrdering]
        : [paginationOrdering];

    return {
        conditions,
        paginationCondition,
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
    cursor: string | number | null;
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

        if (!hasKey(response, view.collectionName)) {
            console.error('Error fetching data, unexpected response format:', response);
            return { rows: [], flattenedRows: [] };
        }

        const rowsFetched = response[view.collectionName];

        // Flatten the data before returning
        return {
            rows: rowsFetched as Record<string, any>[],
            flattenedRows: flattenFields(rowsFetched as Record<string, any>[], view.columnDefinitions)
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
    rows: Record<string, any>[],
    columns: ColumnDefinition[]
): FlattenedDataRow[] => {
    return rows.map(row => {
        return Object.fromEntries(
            columns.map(column => [column.id, flattenColumnFields(row, column)])
        ) as FlattenedDataRow;
    });
};

// Helper to extract field values for a column from a row
export const flattenColumnFields = (row: Record<string, any>, column: ColumnDefinition) => {
    // Build a per-column cell data object that includes ONLY the fields requested
    // by the column's FieldQuery definitions. We preserve nested object structure
    // (customer.name -> { customer: { name } }) but do not create dot-key strings.
    // For queries that target nested paths we currently copy the entire nested
    // object at the root level (e.g. both customer.name and customer.email simply
    // copy row.customer). This keeps renderers that expect combined nested data working.
    // For alias fields we prefer the alias value already present in the row (as returned
    // by GraphQL). If missing, we derive it from the underlying field query.

    const cellData: Record<string, any> = {};

    function getUnderlyingValue(fq: any): any {
        if (!fq || typeof fq !== 'object') return undefined;
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

    function processFieldQuery(fq: any) {
        if (!fq || typeof fq !== 'object') return;
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

    column.data.forEach(processFieldQuery);
    return cellData;
};

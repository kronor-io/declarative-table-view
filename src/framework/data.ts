import { GraphQLClient } from 'graphql-request';
import { buildHasuraConditions } from '../framework/graphql';
import { View } from '../framework/view';
import { ColumnDefinition, FieldQuery, QueryConfig } from '../framework/column-definition';
import { FilterState } from './state';

export interface FetchDataResult {
    rows: Record<string, unknown>[]; // Fetched rows from the query
    flattenedRows: Record<string, unknown>[][]; // Rows flattened according to column definitions
}

function hasKey<K extends string | number | symbol, T extends { [key in K]: unknown[] }>(obj: unknown, key: K): obj is T {
    return typeof obj === 'object' && obj !== null && key in obj && Array.isArray((obj as T)[key]);
}

// Request counter to be able to cancel handling of previous requests
let requestCounter = 0;

export const fetchData = async ({
    client,
    view,
    query,
    filterState,
    rows,
    cursor
}: {
    client: GraphQLClient;
    view: View;
    query: string;
    filterState: FilterState;
    rows: number;
    cursor: string | number | null;
}): Promise<FetchDataResult> => {
    // Assign a unique ID to this request for ordering
    const currentRequestId = ++requestCounter;

    try {
        let conditions = buildHasuraConditions(filterState, view.filterSchema);

        // Merge staticConditions (always-on) if present
        if (view.staticConditions && view.staticConditions.length > 0) {
            // If existing conditions object is empty (no user filters), we still wrap both sides in _and for consistency
            conditions = { _and: [conditions, ...view.staticConditions] } as any;
        }
        if (cursor !== null) {
            const pagKey = view.paginationKey;
            const pagCond = { [pagKey]: { _lt: cursor } };
            // Always wrap in _and for pagination
            // If static conditions already produced an _and wrapper, append to its array to avoid nesting
            if (conditions && '_and' in conditions && Array.isArray((conditions as any)._and)) {
                (conditions as any)._and.push(pagCond);
            } else {
                conditions = { _and: [conditions, pagCond] } as any;
            }
        }
        const variables = {
            conditions,
            limit: rows,
            orderBy: [{ [view.paginationKey]: 'DESC' }],
        };

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
): Record<string, any>[][] => {
    return rows.map(row =>
        columns.map(column => flattenColumnFields(row, column))
    );
};

// Helper to extract field values for a column from a row
export const flattenColumnFields = (row: Record<string, any>, column: ColumnDefinition) => {
    const values: Record<string, any> = {};

    const extractField = (fieldQuery: FieldQuery) => {
        if (fieldQuery.type === 'field') {
            const path = fieldQuery.path.split('.');
            let value: any = row;
            for (const p of path) {
                if (Array.isArray(value)) {
                    // If value is an array, map extraction for each item
                    value = value.map(item => {
                        let v = item;
                        for (let i = path.indexOf(p); i < path.length; i++) {
                            v = v?.[path[i]];
                        }
                        return v;
                    });
                    break;
                } else {
                    value = value?.[p];
                }
            }
            values[fieldQuery.path] = value;
        } else if (fieldQuery.type === 'queryConfigs') {
            const pathKey = fieldQuery.configs.map(c => c.field).join('.');

            const extract = (currentValue: any, configs: QueryConfig[]): any => {
                if (configs.length === 0) {
                    return currentValue;
                }

                if (currentValue === undefined || currentValue === null) {
                    return undefined;
                }

                const [currentConfig, ...remainingConfigs] = configs;

                if (Array.isArray(currentValue)) {
                    return currentValue.map(item => extract(item, configs));
                }

                if (typeof currentValue === 'object' && currentConfig.field in currentValue) {
                    const nextValue = currentValue[currentConfig.field];
                    return extract(nextValue, remainingConfigs);
                }

                return undefined;
            };

            values[pathKey] = extract(row, fieldQuery.configs);
        } else if (fieldQuery.type === 'fieldAlias') {
            // For field aliases, we look up the value using the alias name instead of the original field path
            // The GraphQL response should contain the aliased field name
            values[fieldQuery.alias] = row[fieldQuery.alias];
        }
    };

    column.data.forEach(extractField);
    return values;
};

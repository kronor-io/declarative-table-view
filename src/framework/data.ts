import { GraphQLClient } from 'graphql-request';
import { FilterFormState } from '../components/FilterForm';
import { buildHasuraConditions } from '../framework/graphql';
import { View } from '../framework/view';
import { ColumnDefinition, FieldQuery } from '../framework/column-definition';

export interface FetchDataResult {
    rows: Record<string, any>[]; // Fetched rows from the query
    flattenedRows: Record<string, any>[][]; // Rows flattened according to column definitions
}

export const fetchData = async ({
    client,
    view,
    filterState,
    rows,
    cursor
}: {
    client: GraphQLClient;
    view: View<any, any>;
    filterState: FilterFormState[];
    rows: number;
    cursor: string | number | null;
}): Promise<FetchDataResult> => {
    try {
        let conditions = buildHasuraConditions(filterState);
        if (cursor !== null) {
            const pagKey = view.paginationKey;
            const pagCond = { [pagKey]: { _lt: cursor } };
            // Always wrap in _and for pagination
            conditions = { _and: [conditions, pagCond] };
        }
        const variables = {
            conditions,
            limit: rows,
            orderBy: [{ [view.paginationKey]: 'DESC' }],
        };
        const response = await client.request(view.query, variables);
        const rowsFetched = view.getResponseRows(response as any);
        // Flatten the data before returning
        return {
            rows: rowsFetched,
            flattenedRows: flattenFields(rowsFetched, view.columnDefinitions)
        }
    } catch (error) {
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

            const extract = (currentValue: any, configs: (typeof fieldQuery.configs)): any => {
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
        }
    };

    column.data.forEach(extractField);
    return values;
};

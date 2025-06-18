import { View } from "../framework/view";
import { ColumnDefinition, defaultCellRenderer } from "../framework/column-definition";
import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";

// Define a simple data type for this view
export type SimpleTestData = {
    id: string;
    testField: string;
    amount: number;
};

// Define a simple query response type
type QueryResponse = {
    simpleTestDataCollection: SimpleTestData[];
};

export const simpleTestViewColumnDefinitions: ColumnDefinition[] = [
    {
        data: ['testField'],
        name: 'Test Column Header', // This is what the test will look for
        cellRenderer: defaultCellRenderer,
    },
    {
        data: ['amount'],
        name: 'Amount',
        cellRenderer: defaultCellRenderer,
    },
];

const filterSchema: FilterFieldSchema = [
    {
        label: 'Amount',
        expression: Filter.greaterThanOrEqual('amount', Control.number())
    }
]; // No filters for this simple view

const collectionName = 'simpleTestDataCollection';

const SimpleTestView: View<SimpleTestData, QueryResponse> = {
    title: 'Simple Test View',
    routeName: 'simple-test-view', // Route name for URL
    collectionName,
    columnDefinitions: simpleTestViewColumnDefinitions, // Use the exported definitions
    filterSchema,
    query: `
        query GetSimpleTestData($conditions: SimpleTestBoolExp, $orderBy: [SimpleTestOrderBy!], $limit: Int) {
            ${collectionName}(where: $conditions, orderBy: $orderBy, limit: $limit) {
                id
                testField
                amount
            }
        }
    `,
    getResponseRows: (response: QueryResponse) => response[collectionName] || [],
    QueryResponseType: {} as QueryResponse,
    paginationKey: 'id',
};

export default SimpleTestView;

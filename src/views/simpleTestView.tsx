import { View } from "../framework/view";
import { ColumnDefinition, field, defaultCellRenderer } from "../framework/column-definition";
import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";

// Define a simple data type for this view
export type SimpleTestData = {
    id: number;
    testField: string;
    amount: number;
};

export const simpleTestViewColumnDefinitions: ColumnDefinition[] = [
    {
        data: ['testField'].map(field),
        name: 'Test Column Header', // This is what the test will look for
        cellRenderer: defaultCellRenderer,
    },
    {
        data: ['amount'].map(field),
        name: 'Amount',
        cellRenderer: defaultCellRenderer,
    },
];

const filterGroups = [
    { name: 'default', label: 'Default Filters' },
    { name: 'extra', label: 'Extra Filters' }
];

const filterSchema: FilterFieldSchema = {
    groups: filterGroups,
    filters: [
        {
            label: 'Amount',
            expression: Filter.greaterThanOrEqual('amount', Control.number()),
            group: 'default'
        },
        {
            label: 'Test Field',
            expression: Filter.equals('testField', Control.text()),
            group: 'extra'
        }
    ]
}; // No filters for this simple view

const collectionName = 'simpleTestDataCollection';

const SimpleTestView: View = {
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
    paginationKey: 'id',
};

export default SimpleTestView;

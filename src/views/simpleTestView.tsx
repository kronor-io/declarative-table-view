import { View } from "../framework/view";
import { ColumnDefinition, field, defaultCellRenderer } from "../framework/column-definition";
import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";

// Define a simple data type for this view
export type SimpleTestData = {
    id: number;
    testField: string;
    amount: number;
    email: string;
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
    {
        data: ['email'].map(field),
        name: 'Email',
        cellRenderer: ({ data, setFilterState }) => {
            const handleEmailClick = () => {
                setFilterState(currentState =>
                    currentState.map(filter => {
                        // Find the email filter and update its value
                        if (filter.type === 'leaf' && filter.key === 'email') {
                            return {
                                ...filter,
                                value: data.email
                            };
                        }
                        return filter;
                    })
                );
            };

            return (
                <button
                    className="text-blue-500 underline hover:text-blue-700 cursor-pointer"
                    onClick={handleEmailClick}
                    title={`Filter by email: ${data.email}`}
                >
                    {data.email}
                </button>
            );
        }
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
            group: 'default',
            aiGenerated: false
        },
        {
            label: 'Test Field',
            expression: Filter.equals('testField', Control.text()),
            group: 'extra',
            aiGenerated: false
        },
        {
            label: 'Email',
            expression: Filter.equals('email', Control.text()),
            group: 'default',
            aiGenerated: false
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
                email
            }
        }
    `,
    paginationKey: 'id',
};

export default SimpleTestView;

import { View } from "../framework/view";
import { ColumnDefinition, field } from "../framework/column-definition";
import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";

// Simple text cell renderer for legacy compatibility
const textCellRenderer = ({ data }: { data: any }) =>
    typeof data === 'object' && data !== null ? Object.values(data)[0]?.toString() : String(data);

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
        cellRenderer: textCellRenderer,
    },
    {
        data: ['amount'].map(field),
        name: 'Amount',
        cellRenderer: textCellRenderer,
    },
    {
        data: ['email'].map(field),
        name: 'Email',
        cellRenderer: ({ data, setFilterState }) => {
            const handleEmailClick = () => {
                setFilterState(currentState =>
                    new Map(
                        Array.from(currentState.entries()).map(([key, filter]) => {
                            // Find the email filter and update its value
                            if (filter.type === 'leaf' && filter.field === 'email') {
                                return [key, {
                                    ...filter,
                                    value: data.email
                                }];
                            }
                            return [key, filter];
                        })
                    )
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
            id: 'amount-gte',
            label: 'Amount',
            expression: Filter.greaterThanOrEqual('amount', Control.number()),
            group: 'default',
            aiGenerated: false
        },
        {
            id: 'test-field-eq',
            label: 'Test Field',
            expression: Filter.equals('testField', Control.text()),
            group: 'extra',
            aiGenerated: false
        },
        {
            id: 'email-eq',
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
    id: 'simple-test-view', // Unique name for URL
    collectionName,
    columnDefinitions: simpleTestViewColumnDefinitions, // Use the exported definitions
    filterSchema,
    boolExpType: 'SimpleTestBoolExp',
    orderByType: '[SimpleTestOrderBy!]',
    paginationKey: 'id'
};

export default SimpleTestView;

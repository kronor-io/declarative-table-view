import { CellRenderer } from "../../framework/column-definition";
import { PhoneNumberFilter } from "../../components/PhoneNumberFilter";
import { Runtime } from "../../framework/runtime";

// Define a simple data type for this view
export type SimpleTestData = {
    id: number;
    testField: string;
    amount: number;
    email: string;
    phone?: string;
};

// Email cell renderer that allows filtering by email
const emailCellRenderer: CellRenderer = ({ data, updateFilterById, applyFilters }) => {
    const handleEmailClick = () => {
        updateFilterById('email-eq', (currentFilter: any) => {
            return { ...currentFilter, value: data.email };
        });
        applyFilters();
    };

    return (
        <button
            className="tw:text-blue-500 tw:underline hover:tw:text-blue-700 tw:cursor-pointer"
            onClick={handleEmailClick}
            title={`Filter by email: ${data.email}`}
        >
            {data.email}
        </button>
    );
};

// Amount cell renderer that demonstrates using the Badge component and FlexRow layout
const amountCellRenderer: CellRenderer = ({ data, components, createElement }) => {
    const { Badge, FlexRow } = components;
    const amount = data.amount;

    // Determine severity based on amount value
    const getSeverity = (amount: number) => {
        if (amount > 250) return 'success';
        if (amount > 200) return 'warning';
        return 'danger';
    };

    return createElement(FlexRow, {
        align: 'center',
        gap: 'gap-2',
        children: [
            createElement(Badge, {
                value: `$${amount}`,
                severity: getSeverity(amount),
                style: { fontSize: '.8rem', padding: '0.3em 1em' }
            }),
            amount > 200 ? '🔥' : '💰'
        ]
    });
};

// Runtime configuration for simple test view
export const simpleTestViewRuntime: Runtime = {
    cellRenderers: {
        emailCellRenderer,
        amountCellRenderer
    },
    queryTransforms: {
        amountOffset: {
            toQuery: (input: number) => ({ value: input + 5 })
        },
        keyValueTransform: {
            toQuery: (input: any) => {
                // Handle empty or null input
                if (!input || input === '') {
                    return { value: input }; // Return object with original value for empty input
                }
                return { field: "transformedField", value: `prefix_${input}` };
            }
        }
    },
    noRowsComponents: {},
    customFilterComponents: {
        PhoneNumberFilter
    },
    initialValues: {},
    suggestionFetchers: {}
};

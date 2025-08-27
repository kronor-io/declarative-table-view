import { CellRenderer, defaultCellRenderer } from "../../framework/column-definition";
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
const emailCellRenderer: CellRenderer = ({ data, setFilterState, applyFilters }) => {
    const handleEmailClick = () => {
        setFilterState(currentState =>
            currentState.map(filter => {
                // Find the email filter and update its value
                if (filter.type === 'leaf' && filter.field === 'email') {
                    return {
                        ...filter,
                        value: data.email
                    };
                }
                return filter;
            })
        );
        applyFilters();
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
        defaultCellRenderer,
        emailCellRenderer,
        amountCellRenderer
    },
    queryTransforms: {
        amountOffset: {
            fromQuery: (input: number) => input - 5,
            toQuery: (input: number) => ({ value: input + 5 })
        },
        keyValueTransform: {
            fromQuery: (input: any) => input?.toString() || "",
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
    initialValues: {}
};

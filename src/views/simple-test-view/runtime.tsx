import { CellRenderer, defaultCellRenderer } from "../../framework/column-definition";
import { PhoneNumberFilter } from "../../components/PhoneNumberFilter";

// Define a simple data type for this view
export type SimpleTestData = {
    id: number;
    testField: string;
    amount: number;
    email: string;
    phone?: string;
};

// Email cell renderer that allows filtering by email
const emailCellRenderer: CellRenderer = ({ data, setFilterState }) => {
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
};

// Runtime configuration for simple test view
export const simpleTestViewRuntime = {
    cellRenderers: {
        defaultCellRenderer,
        emailCellRenderer
    },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {
        PhoneNumberFilter
    }
};

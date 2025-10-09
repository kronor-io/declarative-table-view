import { FlexColumn } from "../../../framework/cell-renderer-components/LayoutHelpers";
import { Button } from "primereact/button";
import { NoRowsComponentProps } from "../../../framework/view";
import { FilterFormState } from "../../../framework/filter-form-state";

const NoRowsExtendDateRange = ({ updateFilterById, applyFilters }: Pick<NoRowsComponentProps, 'updateFilterById' | 'applyFilters'>) => {
    const handleExtend = () => {
        // Update the first child (the lower end of the date range)
        updateFilterById('date-range', (currentFilter: FilterFormState) => {
            if (currentFilter.type === 'and' && currentFilter.children.length > 0) {
                const firstChild = currentFilter.children[0];
                if (firstChild.type === 'leaf') {
                    const current = new Date(firstChild.value);
                    current.setMonth(current.getMonth() - 1);

                    return {
                        ...currentFilter,
                        children: [
                            { ...firstChild, value: current },
                            ...currentFilter.children.slice(1)
                        ]
                    };
                }
            }
            return currentFilter; // No change if not the expected structure
        });
        applyFilters();
    };
    return (
        <FlexColumn align="center" justify="center" className="tw:py-8 tw:text-gray-400">
            <span>No data rows match the current filter.</span>
            <Button label="Extend the date range back by 1 month" onClick={handleExtend} size="small" />
        </FlexColumn>
    );
};

export default NoRowsExtendDateRange;

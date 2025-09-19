import { FlexColumn } from "../../../framework/cell-renderer-components/LayoutHelpers";
import { Button } from "primereact/button";
import { NoRowsComponentProps } from "../../../framework/view";

const NoRowsExtendDateRange = ({ setFilterState, applyFilters }: Pick<NoRowsComponentProps, 'setFilterState' | 'applyFilters'>) => {
    const handleExtend = () => {
        // Extend the 'from' date 1 month further back immutably
        setFilterState(currentState =>
            new Map(
                Array.from(currentState.entries()).map(([key, filter]) => {
                    if (filter.type === 'and' && Array.isArray(filter.children)) {
                        return [key, {
                            ...filter,
                            children: filter.children.map(child => {
                                if (child.type === 'leaf' && child.field === 'createdAt' && child.filterType === 'greaterThanOrEqual') {
                                    const current = new Date(child.value);
                                    current.setMonth(current.getMonth() - 1);
                                    return { ...child, value: current };
                                }
                                return child;
                            })
                        }];
                    }
                    return [key, filter];
                })
            )
        );
        applyFilters();
    };
    return (
        <FlexColumn align="center" justify="center" className="py-8 text-gray-400">
            <span>No data rows match the current filter.</span>
            <Button label="Extend the date range back by 1 month" onClick={handleExtend} size="small" />
        </FlexColumn>
    );
};

export default NoRowsExtendDateRange;

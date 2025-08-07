import { Center } from "../../components/LayoutHelpers";
import { Button } from "primereact/button";
import { NoRowsComponentProps } from "../../framework/view";

const NoRowsExtendDateRange = ({ setFilterState, fetchData }: Pick<NoRowsComponentProps, 'setFilterState' | 'fetchData'>) => {
    const handleExtend = () => {
        // Extend the 'from' date 1 month further back immutably
        setFilterState(currentState =>
            currentState.map(filter => {
                if (filter.type === 'and' && Array.isArray(filter.children)) {
                    return {
                        ...filter,
                        children: filter.children.map(child => {
                            if (child.type === 'leaf' && child.key === 'createdAt' && child.filterType === 'greaterThanOrEqual') {
                                const current = new Date(child.value);
                                current.setMonth(current.getMonth() - 1);
                                return { ...child, value: current };
                            }
                            return child;
                        })
                    };
                }
                return filter;
            })
        );
        fetchData();
    };
    return (
        <Center className="py-8 text-gray-400 flex flex-col items-center gap-4">
            <span>No payment requests match the current filter.</span>
            <Button label="Extend the date range back by 1 month" onClick={handleExtend} size="small" />
        </Center>
    );
};

export default NoRowsExtendDateRange;

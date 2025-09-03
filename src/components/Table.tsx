import React from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { ColumnDefinition } from '../framework/column-definition';
import { FilterFormState } from './FilterForm';
import { NoRowsComponent } from '../framework/view';
import { FlexRow, FlexColumn, DateTime, CurrencyAmount } from '../framework/cell-renderer-components/LayoutHelpers';
import { Mapping } from '../framework/cell-renderer-components/Mapping';
import { Link } from '../framework/cell-renderer-components/Link';

type TableProps = {
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][]; // Array of rows, each row is an array of values for the columns
    noRowsComponent?: NoRowsComponent; // The noRowsComponent function
    setFilterState: (filterState: FilterFormState[]) => void; // Function to update filter state
    filterState: FilterFormState[]; // Current filter state
    triggerRefetch: () => void; // Function to trigger data refetch
};

function Table({
    columns,
    data,
    noRowsComponent,
    setFilterState,
    filterState,
    triggerRefetch
}: TableProps) {
    // Create wrapped setFilterState that provides current state to updater function
    const wrappedSetFilterState = (updater: (currentState: FilterFormState[]) => FilterFormState[]) => {
        const newState = updater(filterState);
        setFilterState(newState);
    };

    // Instantiate the noRowsComponent if it exists
    const noDataRowsComponent = noRowsComponent
        ? noRowsComponent({
            filterState,
            setFilterState: wrappedSetFilterState,
            applyFilters: triggerRefetch
        })
        : null;

    return (
        <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines stripedRows size='small' emptyMessage={noDataRowsComponent}>
            {columns.map((column, columnIndex) => (
                <Column
                    key={columnIndex}
                    header={column.name}
                    body={rowData => column.cellRenderer({
                        data: rowData[columnIndex],
                        setFilterState: wrappedSetFilterState,
                        applyFilters: triggerRefetch,
                        createElement: React.createElement,
                        components: {
                            Badge: Tag,
                            FlexRow,
                            FlexColumn,
                            Mapping,
                            DateTime,
                            CurrencyAmount,
                            Link
                        }
                    })}
                />
            ))}
        </DataTable>
    );
}

export default Table;

import React from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { ColumnDefinition } from '../framework/column-definition';
import { FilterFormState } from './FilterForm';
import { NoRowsComponent } from '../framework/view';
import { FlexRow, FlexColumn } from './LayoutHelpers';

type TableProps<CellRendererContext = unknown> = {
    columns: ColumnDefinition<CellRendererContext>[];
    data: Record<string, unknown>[][]; // Array of rows, each row is an array of values for the columns
    noRowsComponent?: NoRowsComponent; // The noRowsComponent function
    cellRendererContext?: CellRendererContext; // Context passed to all cell renderers
    setFilterState: (filterState: FilterFormState[]) => void; // Function to update filter state
    filterState: FilterFormState[]; // Current filter state
    triggerRefetch: () => void; // Function to trigger data refetch
};

function Table<CellRendererContext = unknown>({
    columns,
    data,
    noRowsComponent,
    cellRendererContext,
    setFilterState,
    filterState,
    triggerRefetch
}: TableProps<CellRendererContext>) {
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
        <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines size='small' emptyMessage={noDataRowsComponent}>
            {columns.map((column, columnIndex) => (
                <Column
                    key={columnIndex}
                    header={column.name}
                    body={rowData => column.cellRenderer({
                        data: rowData[columnIndex],
                        context: cellRendererContext,
                        setFilterState: wrappedSetFilterState,
                        applyFilters: triggerRefetch,
                        createElement: React.createElement,
                        components: {
                            Badge: Tag,
                            FlexRow,
                            FlexColumn
                        }
                    })}
                />
            ))}
        </DataTable>
    );
}

export default Table;

import React from 'react';
import { DataTable, DataTableExportFunctionEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { ColumnDefinition } from '../framework/column-definition';
import { NoRowsComponent } from '../framework/view';
import { FlexRow, FlexColumn, DateTime } from '../framework/cell-renderer-components/LayoutHelpers';
import { CurrencyAmount } from '../framework/cell-renderer-components/CurrencyAmount';
import { majorToMinor, minorToMajor } from '../framework/currency';
import { Mapping } from '../framework/cell-renderer-components/Mapping';
import { Link } from '../framework/cell-renderer-components/Link';
import { FilterState, getFilterStateById, setFilterStateById } from '../framework/state';
import { FilterFormState } from '../framework/filter-form-state';

type TableProps = {
    viewId: string;
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][]; // Array of rows, each row is an array of values for the columns
    noRowsComponent?: NoRowsComponent; // The noRowsComponent function
    setFilterState: (filterState: FilterState) => void; // Function to update filter state
    filterState: FilterState; // Current filter state
    triggerRefetch: () => void; // Function to trigger data refetch
    ref?: React.Ref<DataTable<any>>; // An outside ref to the DataTable instance
};

function Table({
    viewId,
    columns,
    data,
    noRowsComponent,
    setFilterState,
    filterState,
    triggerRefetch,
    ref
}: TableProps) {
    // Create wrapped setFilterState that provides current state to updater function
    const wrappedSetFilterState = (updater: (currentState: FilterState) => FilterState) => {
        const newState = updater(filterState);
        setFilterState(newState);
    };

    // Instantiate the noRowsComponent if it exists
    const noDataRowsComponent = noRowsComponent
        ? noRowsComponent({
            filterState,
            setFilterState: wrappedSetFilterState,
            applyFilters: triggerRefetch,
            updateFilterById: (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => {
                wrappedSetFilterState(currentState => {
                    try {
                        const currentFilter = getFilterStateById(currentState, filterId);
                        const updatedFilter = updater(currentFilter);
                        if (updatedFilter === currentFilter) return currentState;
                        return setFilterStateById(currentState, filterId, updatedFilter);
                    } catch {
                        return currentState; // filter missing -> no change
                    }
                });
            }
        })
        : null;

    const exportFunction = (event: DataTableExportFunctionEvent<any>) => {
        const data = (event.rowData as [])[Number(event.field)]
        return data[Object.keys(data)[0]]
    }

    return (
        <DataTable
            ref={ref}
            value={data}
            tableStyle={{ minWidth: '50rem' }}
            showGridlines
            stripedRows
            size='small'
            emptyMessage={noDataRowsComponent}
            exportFunction={exportFunction}
            exportFilename={viewId}
        >
            {columns.map((column, columnIndex) => (
                <Column
                    key={columnIndex}
                    field={columnIndex.toString()}
                    header={column.name}
                    body={rowData => column.cellRenderer({
                        data: rowData[columnIndex],
                        setFilterState: wrappedSetFilterState,
                        applyFilters: triggerRefetch,
                        updateFilterById: (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => {
                            wrappedSetFilterState(currentState => {
                                try {
                                    const currentFilter = getFilterStateById(currentState, filterId);
                                    const updatedFilter = updater(currentFilter);
                                    if (updatedFilter === currentFilter) return currentState;
                                    return setFilterStateById(currentState, filterId, updatedFilter);
                                } catch {
                                    return currentState;
                                }
                            });
                        },
                        createElement: React.createElement,
                        components: {
                            Badge: Tag,
                            FlexRow,
                            FlexColumn,
                            Mapping,
                            DateTime,
                            CurrencyAmount,
                            Link
                        },
                        currency: { minorToMajor, majorToMinor }
                    })}
                />
            ))}
        </DataTable>
    );
}

export default Table;

import * as React from 'react';
import { useEffect, useState } from 'react';
import { DataTable, DataTableExportFunctionEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import type { ColumnDefinition, TableColumnDefinition } from '../framework/column-definition';
import { NoRowsComponent } from '../framework/view';
import { FlexRow, FlexColumn, DateTime } from '../framework/cell-renderer-components/LayoutHelpers';
import { CurrencyAmount } from '../framework/cell-renderer-components/CurrencyAmount';
import { majorToMinor, minorToMajor } from '../framework/currency';
import { Mapping } from '../framework/cell-renderer-components/Mapping';
import { Link } from '../framework/cell-renderer-components/Link';
import { FilterState, getFilterStateById, setFilterStateById } from '../framework/state';
import { FilterFormState } from '../framework/filter-form-state';
import { simplifyRow, simplifyRows } from '../framework/rows';
import type { FlattenedDataRow } from '../framework/data';

export interface RowSelectionAPI {
    resetRowSelection(): void;
}

type TableProps = {
    viewId: string;
    columns: ColumnDefinition[];
    hiddenColumnIds: string[];
    data: FlattenedDataRow[]; // Array of rows, each row keyed by column id
    noRowsComponent?: NoRowsComponent; // The noRowsComponent function
    setFilterState: (filterState: FilterState) => void; // Function to update filter state
    filterState: FilterState; // Current filter state
    triggerRefetch: () => void; // Function to trigger data refetch
    ref?: React.Ref<DataTable<any>>; // An outside ref to the DataTable instance
    rowSelection?: {
        rowSelectionType: 'none' | 'multiple';
        onRowSelectionChange?: (rows: any[]) => void;
        /** Ref object populated by Table with RowSelectionAPI */
        apiRef?: React.RefObject<RowSelectionAPI | null>;
    };
    // Row class callback, receives a simplified/flattened row object (merged cells)
    rowClassFunction?: (row: Record<string, any>) => Record<string, boolean>;
};

function Table({
    viewId,
    columns,
    hiddenColumnIds,
    data,
    noRowsComponent,
    setFilterState,
    filterState,
    triggerRefetch,
    ref,
    rowSelection,
    rowClassFunction
}: TableProps) {
    const hiddenSet = new Set(hiddenColumnIds);
    const renderableColumns: TableColumnDefinition[] = columns.filter((column): column is TableColumnDefinition => {
        if (column.type !== 'tableColumn') return false;
        return !hiddenSet.has(column.id);
    });

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
        const row = event.rowData as FlattenedDataRow;
        const cell = row[event.field];
        if (!cell || typeof cell !== 'object') return '';
        const firstKey = Object.keys(cell)[0];
        return firstKey ? cell[firstKey] : '';
    }

    // Internal selection state only relevant if enabled
    const [selectedRows, setSelectedRows] = useState<any[] | null>(null);
    const selectionType = rowSelection?.rowSelectionType ?? 'none';

    // Populate imperative API ref if provided
    useEffect(() => {
        if (rowSelection?.apiRef) {
            rowSelection.apiRef.current = {
                resetRowSelection: () => setSelectedRows([])
            };
        }
    }, [rowSelection]);

    const handleSelectionChange = (rows: any[]) => {
        if (selectionType === 'none') return; // ignore events if disabled
        setSelectedRows(rows);
        rowSelection?.onRowSelectionChange?.(simplifyRows(rows));
    };

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
            selectionPageOnly={true}
            selectionMode={selectionType === 'multiple' ? 'checkbox' : null}
            selection={selectionType === 'multiple' ? selectedRows : null}
            onSelectionChange={selectionType === 'multiple' ? (e: any) => handleSelectionChange(e.value) : undefined}
            rowClassName={rowClassFunction ? (row: any) => rowClassFunction(simplifyRow(row)) : undefined}
            scrollable
            scrollHeight='flex'
        >
            {selectionType === 'multiple' && <Column selectionMode="multiple" />}
            {renderableColumns
                .map(column => (
                    <Column
                        key={column.id}
                        field={column.id}
                        header={column.name}
                        body={(rowData: FlattenedDataRow) => column.cellRenderer({
                            data: rowData[column.id],
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
                            currency: { minorToMajor, majorToMinor },
                            columnDefinition: column
                        })}
                    />
                ))}
        </DataTable>
    );
}

export default Table;

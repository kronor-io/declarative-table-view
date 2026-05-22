import * as React from 'react';
import { useEffect, useState } from 'react';
import { DataTable, DataTableExportFunctionEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import type { ColumnDefinition, TableColumnDefinition } from '../framework/column-definition';
import { NoRowsComponent, RowExpansionDefinition } from '../framework/view';
import { FlexRow, FlexColumn, DateTime } from '../framework/cell-renderer-components/LayoutHelpers';
import { CurrencyAmount } from '../framework/cell-renderer-components/CurrencyAmount';
import { majorToMinor, minorToMajor } from '../framework/currency';
import { Mapping } from '../framework/cell-renderer-components/Mapping';
import { Link } from '../framework/cell-renderer-components/Link';
import { FilterState, getFilterStateById, setFilterStateById } from '../framework/state';
import { FilterFormState } from '../framework/filter-form-state';
import { simplifyRow, simplifyRows } from '../framework/rows';
import { flattenFieldQueries, type FlattenedDataRow } from '../framework/data';

export type RowSelectionResetFn = () => void;
export type RowExpansionApi = {
    reset: () => void;
    collapseAll: () => void;
    expandAll: () => void;
};

type TableProps = {
    viewId: string;
    columns: ColumnDefinition[];
    hiddenColumnIds: string[];
    data: FlattenedDataRow[]; // Array of rows, each row keyed by column id
    rawRows: Record<string, unknown>[];
    rowExpansion?: RowExpansionDefinition;
    noRowsComponent?: NoRowsComponent; // The noRowsComponent function
    setFilterState: (filterState: FilterState) => void; // Function to update filter state
    filterState: FilterState; // Current filter state
    triggerRefetch: () => void; // Function to trigger data refetch
    ref?: React.Ref<DataTable<any>>; // An outside ref to the DataTable instance
    rowSelection?: {
        rowSelectionType: 'none' | 'multiple';
        onRowSelectionChange?: (rows: any[]) => void;
    };

    /** Optional callback invoked when row selection reset becomes available/unavailable. */
    onRowSelectionResetChange?: (resetFn: RowSelectionResetFn | null) => void;
    onRowExpansionApiChange?: (api: RowExpansionApi | null) => void;
    // Row class callback, receives a simplified/flattened row object (merged cells)
    rowClassFunction?: (row: Record<string, any>) => Record<string, boolean>;
};

function Table({
    viewId,
    columns,
    hiddenColumnIds,
    data,
    rawRows,
    rowExpansion,
    noRowsComponent,
    setFilterState,
    filterState,
    triggerRefetch,
    ref,
    rowSelection,
    rowClassFunction,
    onRowSelectionResetChange,
    onRowExpansionApiChange
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

    const updateFilterById = (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => {
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
    };

    const sharedRendererProps = {
        setFilterState: wrappedSetFilterState,
        applyFilters: triggerRefetch,
        updateFilterById,
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
    };

    // Instantiate the noRowsComponent if it exists
    const noDataRowsComponent = noRowsComponent
        ? noRowsComponent({
            filterState,
            setFilterState: wrappedSetFilterState,
            applyFilters: triggerRefetch,
            updateFilterById
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
    const [expandedRows, setExpandedRows] = useState<FlattenedDataRow[]>([]);
    const selectionType = rowSelection?.rowSelectionType ?? 'none';

    const getRawRow = React.useCallback((rowData: FlattenedDataRow) => {
        const rowIndex = data.indexOf(rowData);
        const rawRow = rowIndex >= 0 ? rawRows[rowIndex] : undefined;
        return (rawRow && typeof rawRow === 'object') ? rawRow : {};
    }, [data, rawRows]);

    const getRowExpansionData = React.useCallback((rowData: FlattenedDataRow) => {
        if (!rowExpansion) return {};
        const rawRow = getRawRow(rowData);
        return flattenFieldQueries(rawRow as Record<string, unknown>, rowExpansion.data);
    }, [getRawRow, rowExpansion]);

    const canExpandRow = React.useCallback((rowData: FlattenedDataRow) => {
        if (!rowExpansion) return false;
        return rowExpansion.canExpand({
            row: simplifyRow(rowData),
            data: getRowExpansionData(rowData)
        });
    }, [getRowExpansionData, rowExpansion]);

    const toggleExpandedRow = React.useCallback((rowData: FlattenedDataRow) => {
        setExpandedRows(currentExpandedRows => {
            const isExpanded = currentExpandedRows.includes(rowData);
            if (isExpanded) {
                return currentExpandedRows.filter(expandedRow => expandedRow !== rowData);
            }
            if (rowExpansion?.mode === 'single') {
                return [rowData];
            }
            return [...currentExpandedRows, rowData];
        });
    }, [rowExpansion?.mode]);

    // Expose row selection reset function (only when enabled)
    useEffect(() => {
        if (selectionType !== 'multiple') {
            onRowSelectionResetChange?.(null);
            return;
        }

        const resetFn: RowSelectionResetFn = () => setSelectedRows([]);
        onRowSelectionResetChange?.(resetFn);

        return () => {
            onRowSelectionResetChange?.(null);
        };
    }, [selectionType, onRowSelectionResetChange]);

    const handleSelectionChange = (rows: any[]) => {
        if (selectionType === 'none') return; // ignore events if disabled
        setSelectedRows(rows);
        rowSelection?.onRowSelectionChange?.(simplifyRows(rows));
    };

    useEffect(() => {
        setExpandedRows([]);
    }, [data, rowExpansion]);

    useEffect(() => {
        if (!rowExpansion) {
            onRowExpansionApiChange?.(null);
            return;
        }

        const collapseAll = () => setExpandedRows([]);
        const expandAll = () => {
            const expandableRows = data.filter(canExpandRow);
            setExpandedRows(rowExpansion.mode === 'single' ? expandableRows.slice(0, 1) : expandableRows);
        };

        onRowExpansionApiChange?.({
            reset: collapseAll,
            collapseAll,
            expandAll,
        });

        return () => {
            onRowExpansionApiChange?.(null);
        };
    }, [canExpandRow, data, onRowExpansionApiChange, rowExpansion]);

    const rowExpansionTemplate = (rowData: FlattenedDataRow) => {
        if (!rowExpansion) return null;

        return rowExpansion.render({
            row: simplifyRow(rowData),
            data: getRowExpansionData(rowData),
            collapse: () => {
                setExpandedRows(currentExpandedRows => currentExpandedRows.filter(expandedRow => expandedRow !== rowData));
            },
            toggle: () => toggleExpandedRow(rowData),
            ...sharedRendererProps
        });
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
            expandedRows={rowExpansion ? expandedRows : undefined}
            onRowToggle={rowExpansion ? (e: any) => {
                const nextExpandedRows = Array.isArray(e.data) ? e.data as FlattenedDataRow[] : [];
                setExpandedRows(rowExpansion.mode === 'single' ? nextExpandedRows.slice(-1) : nextExpandedRows);
            } : undefined}
            rowExpansionTemplate={rowExpansion ? rowExpansionTemplate : undefined}
            rowClassName={rowClassFunction ? (row: any) => rowClassFunction(simplifyRow(row)) : undefined}
            scrollable
            scrollHeight='flex'
        >
            {selectionType === 'multiple' && <Column selectionMode="multiple" />}
            {rowExpansion && <Column expander={(rowData: FlattenedDataRow) => canExpandRow(rowData)} style={{ width: '3rem' }} />}
            {renderableColumns
                .map(column => (
                    <Column
                        key={column.id}
                        field={column.id}
                        header={column.name}
                        body={(rowData: FlattenedDataRow) => column.cellRenderer({
                            data: rowData[column.id],
                            ...sharedRendererProps,
                            columnDefinition: column
                        })}
                    />
                ))}
        </DataTable>
    );
}

export default Table;

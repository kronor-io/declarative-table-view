import * as React from 'react';
import { useEffect, useState } from 'react';
import { DataTable, DataTableExportFunctionEvent, type DataTableSelectionMultipleChangeEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { getColumnOrderBy, type ColumnDefinition, type TableColumnDefinition } from '../framework/column-definition';
import { NoRowsComponent, RowExpansionDefinition, type SimplifiedRow } from '../framework/view';
import { FlexRow, FlexColumn, DateTime } from '../framework/cell-renderer-components/LayoutHelpers';
import { CurrencyAmount } from '../framework/cell-renderer-components/CurrencyAmount';
import { majorToMinor, minorToMajor } from '../framework/currency';
import { Mapping } from '../framework/cell-renderer-components/Mapping';
import { Link } from '../framework/cell-renderer-components/Link';
import { FilterState, getFilterStateById, setFilterStateById } from '../framework/state';
import { FilterFormState } from '../framework/filter-form-state';
import { simplifyRow } from '../framework/rows';
import { flattenFieldQueries, type FlattenedDataRow } from '../framework/data';
import type { DataOrdering } from '../framework/data-ordering';
import { useTrack } from '../framework/analytics-emitter';

export type RowSelectionResetFn = () => void;
export type RowExpansionApi = {
    reset: () => void;
    collapseAll: () => void;
    expandAll: () => void;
};

type LazyRowExpansionLoadArgs = {
    row: Record<string, unknown>;
    rowKey: string | number;
};

type LazyRowExpansionState = {
    status: 'loading' | 'loaded' | 'error';
    data?: Record<string, unknown>;
};

const INTERNAL_ROW_INDEX = '__dtvRowIndex';

type TableDataRow = FlattenedDataRow & {
    [INTERNAL_ROW_INDEX]: number;
};

// `Row` is what the rows' merged column data is (see `SimplifiedRow`), as the App's views say.
type TableProps<Row> = {
    viewId: string;
    columns: ColumnDefinition[];
    hiddenColumnIds: string[];
    paginationKey: string;
    data: FlattenedDataRow[]; // Array of rows, each row keyed by column id
    rawRows: Record<string, unknown>[];
    rowExpansion?: RowExpansionDefinition;
    loadLazyRowExpansionData?: (args: LazyRowExpansionLoadArgs) => Promise<Record<string, unknown>>;
    noRowsComponent?: NoRowsComponent; // The noRowsComponent function
    setFilterState: (filterState: FilterState) => void; // Function to update filter state
    filterState: FilterState; // Current filter state
    applyFilters: () => void; // Applies the current (draft) filter state and refetches
    ref?: React.Ref<DataTable<any>>; // An outside ref to the DataTable instance
    rowSelection?: {
        rowSelectionType: 'none' | 'multiple';
        onRowSelectionChange?: (rows: Row[]) => void;
    };

    /** Optional callback invoked when row selection reset becomes available/unavailable. */
    onRowSelectionResetChange?: (resetFn: RowSelectionResetFn | null) => void;
    onRowExpansionApiChange?: (api: RowExpansionApi | null) => void;
    // Row class callback, receives a simplified/flattened row object (merged cells)
    rowClassFunction?: (row: Row) => Record<string, boolean>;
    ordering?: DataOrdering | null;
    onOrderingChange?: (ordering: DataOrdering | null) => void;
};

function Table<Row extends object = SimplifiedRow>({
    viewId,
    columns,
    hiddenColumnIds,
    paginationKey,
    data,
    rawRows,
    rowExpansion,
    loadLazyRowExpansionData,
    noRowsComponent,
    setFilterState,
    filterState,
    applyFilters,
    ref,
    rowSelection,
    rowClassFunction,
    onRowSelectionResetChange,
    onRowExpansionApiChange,
    ordering = null,
    onOrderingChange
}: TableProps<Row>) {
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
        applyFilters,
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
            applyFilters,
            updateFilterById
        })
        : null;

    const exportFunction = (event: DataTableExportFunctionEvent<any>) => {
        const row = event.rowData as TableDataRow;
        const cell = row[event.field];
        if (!cell || typeof cell !== 'object') return '';
        const firstKey = Object.keys(cell)[0];
        return firstKey ? cell[firstKey] : '';
    }

    const handleSortChange = (event: { sortField?: string | null; sortOrder?: 1 | 0 | -1 | null }) => {
        if (!event.sortField || (event.sortOrder !== 1 && event.sortOrder !== -1)) {
            onOrderingChange?.(null);
            return;
        }

        onOrderingChange?.({
            field: event.sortField,
            direction: event.sortOrder === 1 ? 'ASC' : 'DESC'
        });
    };

    const tableData = React.useMemo(() => {
        return data.map((row, rowIndex) => ({
            ...row,
            [INTERNAL_ROW_INDEX]: rowIndex
        })) as TableDataRow[];
    }, [data]);

    const rowsMatch = React.useCallback((leftRow: Record<string, unknown>, rightRow: Record<string, unknown>) => {
        const keys = Array.from(new Set([
            ...Object.keys(leftRow),
            ...Object.keys(rightRow)
        ])).filter(key => key !== INTERNAL_ROW_INDEX);

        return keys.every(key => JSON.stringify(leftRow[key]) === JSON.stringify(rightRow[key]));
    }, []);

    const getRowIndex = React.useCallback((rowData: TableDataRow) => {
        const explicitRowIndex = (rowData as Record<string, unknown>)[INTERNAL_ROW_INDEX];
        if (typeof explicitRowIndex === 'number') {
            return explicitRowIndex;
        }

        return tableData.findIndex(candidateRow => rowsMatch(candidateRow, rowData));
    }, [rowsMatch, tableData]);

    const isSameRow = React.useCallback((leftRow: TableDataRow, rightRow: TableDataRow) => {
        return getRowIndex(leftRow) === getRowIndex(rightRow);
    }, [getRowIndex]);

    // Internal selection state only relevant if enabled
    const [selectedRows, setSelectedRows] = useState<TableDataRow[] | null>(null);
    const [expandedRows, setExpandedRows] = useState<TableDataRow[]>([]);
    const [lazyRowExpansionState, setLazyRowExpansionState] = useState<Record<string, LazyRowExpansionState>>({});
    const lazyRowExpansionStateRef = React.useRef<Record<string, LazyRowExpansionState>>({});
    const selectionType = rowSelection?.rowSelectionType ?? 'none';

    const getRawRow = React.useCallback((rowData: TableDataRow) => {
        const rowIndex = getRowIndex(rowData);
        const rawRow = rowIndex >= 0 ? rawRows[rowIndex] : undefined;
        return (rawRow && typeof rawRow === 'object') ? rawRow : {};
    }, [getRowIndex, rawRows]);

    const getValueAtPath = React.useCallback((value: unknown, path: string) => {
        return path.split('.').reduce<unknown>((currentValue, segment) => {
            if (!currentValue || typeof currentValue !== 'object') {
                return undefined;
            }

            return (currentValue as Record<string, unknown>)[segment];
        }, value);
    }, []);

    const getRowExpansionKeyValue = React.useCallback((rowData: TableDataRow) => {
        const rawRow = getRawRow(rowData);
        const rowKey = getValueAtPath(rawRow, paginationKey);
        return typeof rowKey === 'string' || typeof rowKey === 'number' ? rowKey : null;
    }, [getRawRow, getValueAtPath, paginationKey]);

    const getLazyRowExpansionEntry = React.useCallback((rowData: TableDataRow) => {
        const rowKey = getRowExpansionKeyValue(rowData);
        if (rowKey === null) {
            return undefined;
        }

        return lazyRowExpansionState[String(rowKey)];
    }, [getRowExpansionKeyValue, lazyRowExpansionState]);

    const ensureLazyRowExpansionData = React.useCallback((rowData: TableDataRow) => {
        if (!rowExpansion?.lazy || !loadLazyRowExpansionData) {
            return;
        }

        const rowKey = getRowExpansionKeyValue(rowData);
        if (rowKey === null) {
            console.error('Lazy row expansion requires a scalar pagination key value on the raw row.');
            return;
        }

        const cacheKey = String(rowKey);
        const rawRow = getRawRow(rowData);
        const existingEntry = lazyRowExpansionStateRef.current[cacheKey];
        if (existingEntry?.status === 'loading' || existingEntry?.status === 'loaded') {
            return;
        }

        const loadingState = {
            ...lazyRowExpansionStateRef.current,
            [cacheKey]: { status: 'loading' as const }
        };
        lazyRowExpansionStateRef.current = loadingState;
        setLazyRowExpansionState(loadingState);

        void loadLazyRowExpansionData({ row: rawRow, rowKey })
            .then(expansionData => {
                const loadedState: Record<string, LazyRowExpansionState> = {
                    ...lazyRowExpansionStateRef.current,
                    [cacheKey]: {
                        status: 'loaded',
                        data: expansionData
                    }
                };
                lazyRowExpansionStateRef.current = loadedState;
                setLazyRowExpansionState(loadedState);
            })
            .catch(error => {
                console.error('Error loading row expansion data:', error);
                const errorState: Record<string, LazyRowExpansionState> = {
                    ...lazyRowExpansionStateRef.current,
                    [cacheKey]: { status: 'error' }
                };
                lazyRowExpansionStateRef.current = errorState;
                setLazyRowExpansionState(errorState);
            });
    }, [getRawRow, getRowExpansionKeyValue, loadLazyRowExpansionData, rowExpansion?.lazy]);

    const getRowExpansionData = React.useCallback((rowData: TableDataRow) => {
        if (!rowExpansion) return {};

        if (rowExpansion.lazy) {
            const lazyEntry = getLazyRowExpansionEntry(rowData);
            if (lazyEntry?.status === 'loaded' && lazyEntry.data) {
                return lazyEntry.data;
            }
        }

        const rawRow = getRawRow(rowData);
        return flattenFieldQueries(rawRow as Record<string, unknown>, rowExpansion.data);
    }, [getLazyRowExpansionEntry, getRawRow, rowExpansion]);

    const canExpandRow = React.useCallback((rowData: TableDataRow) => {
        if (!rowExpansion) return false;
        return rowExpansion.canExpand({
            row: simplifyRow(rowData),
            data: getRowExpansionData(rowData)
        });
    }, [getRowExpansionData, rowExpansion]);

    const track = useTrack();
    // The rows expanded as the user sees them: what a toggle reports is read from here, at the
    // time of the click, not from a render's copy
    const expandedRowsRef = React.useRef(expandedRows);
    React.useLayoutEffect(() => {
        expandedRowsRef.current = expandedRows;
    });
    const isExpanded = React.useCallback(
        (rowData: TableDataRow) => expandedRowsRef.current.some(expandedRow => isSameRow(expandedRow, rowData)),
        [isSameRow]
    );
    /** Reports that the user expanded or collapsed `rowData`, when that changes it. */
    const reportToggle = React.useCallback((rowData: TableDataRow, expanded: boolean) => {
        if (isExpanded(rowData) !== expanded) track({ type: 'rowExpansionToggled', expanded });
    }, [isExpanded, track]);

    const toggleExpandedRow = React.useCallback((rowData: TableDataRow) => {
        reportToggle(rowData, !isExpanded(rowData));
        setExpandedRows(currentExpandedRows => {
            const isExpanded = currentExpandedRows.some(expandedRow => isSameRow(expandedRow, rowData));
            if (isExpanded) {
                return currentExpandedRows.filter(expandedRow => !isSameRow(expandedRow, rowData));
            }

            ensureLazyRowExpansionData(rowData);

            if (rowExpansion?.mode === 'single') {
                return [rowData];
            }
            return [...currentExpandedRows, rowData];
        });
    }, [ensureLazyRowExpansionData, isExpanded, isSameRow, reportToggle, rowExpansion?.mode]);

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

    // The one place the merged column data is taken to be a `Row`: SimplifiedRow is worked out
    // from the same column queries simplifyRow merges.
    const toRow = (rowData: TableDataRow) => simplifyRow(rowData) as Row;

    const handleSelectionChange = (rows: TableDataRow[]) => {
        if (selectionType === 'none') return; // ignore events if disabled
        setSelectedRows(rows);
        rowSelection?.onRowSelectionChange?.(rows.map(toRow));
    };

    useEffect(() => {
        setExpandedRows([]);
    }, [data, rowExpansion]);

    useEffect(() => {
        lazyRowExpansionStateRef.current = {};
        setLazyRowExpansionState({});
    }, [rowExpansion, viewId]);

    useEffect(() => {
        if (!rowExpansion) {
            onRowExpansionApiChange?.(null);
            return;
        }

        const collapseAll = () => setExpandedRows([]);
        const expandAll = () => {
            const expandableRows = tableData.filter(canExpandRow);
            expandableRows.forEach(ensureLazyRowExpansionData);
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
    }, [canExpandRow, ensureLazyRowExpansionData, onRowExpansionApiChange, rowExpansion, tableData]);

    const rowExpansionTemplate = (rowData: TableDataRow) => {
        if (!rowExpansion) return null;

        const props = {
            row: simplifyRow(rowData),
            data: getRowExpansionData(rowData),
            collapse: () => {
                reportToggle(rowData, false);
                setExpandedRows(currentExpandedRows => currentExpandedRows.filter(expandedRow => !isSameRow(expandedRow, rowData)));
            },
            toggle: () => toggleExpandedRow(rowData),
            ...sharedRendererProps
        };

        if (!rowExpansion.lazy) {
            return rowExpansion.render({ ...props, state: 'ready' });
        }

        const lazyEntry = getLazyRowExpansionEntry(rowData);
        const renderState = !lazyEntry || lazyEntry.status === 'loading'
            ? 'loading'
            : lazyEntry.status === 'error'
                ? 'error'
                : 'ready';
        return rowExpansion.render({ ...props, state: renderState });
    };

    return (
        <DataTable
            ref={ref}
            value={tableData}
            tableStyle={{ minWidth: '50rem' }}
            lazy
            showGridlines
            stripedRows
            size='small'
            emptyMessage={noDataRowsComponent}
            exportFunction={exportFunction}
            exportFilename={viewId}
            selectionPageOnly={true}
            selectionMode={selectionType === 'multiple' ? 'checkbox' : null}
            selection={selectionType === 'multiple' ? selectedRows : null}
            onSelectionChange={selectionType === 'multiple' ? (e: DataTableSelectionMultipleChangeEvent<TableDataRow[]>) => handleSelectionChange(e.value) : undefined}
            expandedRows={rowExpansion ? expandedRows : undefined}
            onRowToggle={rowExpansion ? (e: any) => {
                const nextExpandedRows = Array.isArray(e.data) ? e.data as TableDataRow[] : [];
                // PrimeReact toggles one row per call
                const toggled = [...nextExpandedRows, ...expandedRowsRef.current]
                    .find(row => nextExpandedRows.some(next => isSameRow(next, row)) !== expandedRowsRef.current.some(shown => isSameRow(shown, row)));
                if (toggled) reportToggle(toggled, nextExpandedRows.some(next => isSameRow(next, toggled)));
                // From the ref, not this render: PrimeReact memoizes the row cells, so this handler
                // can be from a render before new rows came, when another row at the same index
                // was still expanded, and the row the user expands would then load nothing
                nextExpandedRows
                    .filter(rowData => !expandedRowsRef.current.some(expandedRow => isSameRow(expandedRow, rowData)))
                    .forEach(ensureLazyRowExpansionData);
                setExpandedRows(rowExpansion.mode === 'single' ? nextExpandedRows.slice(-1) : nextExpandedRows);
            } : undefined}
            rowExpansionTemplate={rowExpansion ? rowExpansionTemplate : undefined}
            rowClassName={rowClassFunction ? (row: TableDataRow) => rowClassFunction(toRow(row)) : undefined}
            sortMode="single"
            removableSort
            sortField={ordering?.field ?? undefined}
            sortOrder={ordering?.direction === 'ASC' ? 1 : ordering?.direction === 'DESC' ? -1 : null}
            onSort={handleSortChange}
            scrollable
            scrollHeight='flex'
        >
            {selectionType === 'multiple' && <Column selectionMode="multiple" />}
            {rowExpansion && <Column expander={(rowData: TableDataRow) => canExpandRow(rowData)} style={{ width: '3rem' }} />}
            {renderableColumns
                .map(column => {
                    const orderBy = getColumnOrderBy(column);

                    return (
                        <Column
                            key={column.id}
                            field={column.id}
                            header={column.name}
                            footer={column.footer}
                            sortable={orderBy !== undefined}
                            sortField={orderBy}
                            body={(rowData: TableDataRow) => column.cellRenderer({
                                data: rowData[column.id],
                                ...sharedRendererProps,
                                columnDefinition: column
                            })}
                        />
                    );
                })}
        </DataTable>
    );
}

export default Table;

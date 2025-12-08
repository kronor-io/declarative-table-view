import React, { useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { ColumnDefinition } from '../../framework/column-definition.tsx';
import convertColumnsToMUI from './convertColumnsToMUI.ts';
import CustomPagination from './CustomPagination.tsx';
import { RowSelectionAPI } from '../Table.tsx';

type TableProps = {
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][];
    rowsPerPageOptions: number[];
    onRowsPerPageChange?: (value: number) => void;
    rowSelection?: {
        rowSelectionType: 'none' | 'multiple';
        onRowSelectionChange?: (rows: any[]) => void;
        apiRef?: React.RefObject<RowSelectionAPI | null>;
    };
    onPageChange: () => void;
    onPrevPage: () => void;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    currentPage?: number;
    rowsPerPage?: number;
    actualRows?: number;
};

export default function MUIDataGrid({
    columns,
    data,
    rowsPerPageOptions,
    onRowsPerPageChange,
    onPageChange,
    onPrevPage,
    hasNextPage,
    hasPrevPage,
    currentPage = 0,
    rowsPerPage: externalRowsPerPage,
    actualRows: externalActualRows,
    rowSelection
}: TableProps) {
    const [pageSize, setPageSize] = React.useState(externalRowsPerPage || rowsPerPageOptions[0]);

    React.useEffect(() => {
        if (externalRowsPerPage && externalRowsPerPage !== pageSize) {
            setPageSize(externalRowsPerPage);
        }
    }, [externalRowsPerPage]);

    const muiColumns = useMemo(() => {
        return convertColumnsToMUI(columns);
    }, [columns]);

    const actualRows = externalActualRows || data.length;
    const handleRowsPerPageChange = (newSize: number) => {
        setPageSize(newSize);
        if (onRowsPerPageChange) {
            onRowsPerPageChange(newSize);
        }
    };

    return (
        <>
            <DataGrid
                rows={data}
                columns={muiColumns}
                getRowId={row => row.transactionId ?? Math.random().toString(36).slice(2, 9)}
                hideFooter
                disableColumnFilter
                disableColumnSorting
                checkboxSelection={!!rowSelection}
                disableRowSelectionOnClick
                getRowClassName={(params) =>
                    params.indexRelativeToCurrentPage % 2 === 1 ? 'even-row' : ''
                }
                sx={{
                    '& .even-row': {
                        backgroundColor: '#f5f5fa',
                    },
                    '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
                        outline: 'none',
                    },
                    '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
                        outline: 'none',
                    },
                    '& .MuiDataGrid-row.Mui-selected': {
                        backgroundColor: '#ebebfa',
                    },
                    '& .MuiDataGrid-cell': {
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 13,
                    },
                    '& .MuiDataGrid-cell > div > div > button, & .MuiDataGrid-cell > div > div > span': {
                        mt: -2,
                        mb: -2,
                    },
                    '& .MuiCheckbox-root svg': {
                        width: 24,
                        height: 24,
                    },
                    '& .MuiDataGrid-columnHeaderTitle': {
                        fontSize: 14,
                        fontWeight: 500,
                    },
                }}
            />

            <CustomPagination
                currentPage={currentPage}
                rowsPerPage={pageSize}
                rowsPerPageOptions={rowsPerPageOptions}
                hasNextPage={hasNextPage}
                hasPrevPage={hasPrevPage}
                actualRows={actualRows}
                onPageChange={onPageChange}
                onPrevPage={onPrevPage}
                onRowsPerPageChange={handleRowsPerPageChange}
            />
        </>
    );
}
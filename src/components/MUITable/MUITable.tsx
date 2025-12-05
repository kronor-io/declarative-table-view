import React, { useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { ColumnDefinition } from '../../framework/column-definition.tsx';
import convertColumnsToMUI from './convertColumnsToMUI.ts';
import CustomPagination from './CustomPagination.tsx';

type TableProps = {
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][];
    rowsPerPageOptions: number[];
    onRowsPerPageChange?: (value: number) => void;
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
    actualRows: externalActualRows
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
                checkboxSelection
                disableRowSelectionOnClick
                getRowClassName={(params) =>
                    params.indexRelativeToCurrentPage % 2 === 1 ? 'even-row' : ''
                }
                sx={{
                    '& .even-row': {
                        backgroundColor: '#f5f5fa',
                    },
                    '& .MuiDataGrid-cell:focus': {
                        outline: 'none',
                    },
                    '& .MuiDataGrid-cell:focus-within': {
                        backgroundColor: 'inherit',
                    }
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
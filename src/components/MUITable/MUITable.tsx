import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';
import { ColumnDefinition } from '../../framework/column-definition.tsx';
import convertColumnsToMUI from './convertColumnsToMUI.ts';
import convertDataToMUIRows from './convertDataToMUIRows.ts';
import CustomPagination from './CustomPagination.tsx';

type TableProps = {
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][];
    ref?: React.Ref<any>;
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
    ref,
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

    const muiRows = useMemo(() => {
        return convertDataToMUIRows(data, columns);
    }, [data, columns]);

    const actualRows = externalActualRows || data.length;
    const handleRowsPerPageChange = (newSize: number) => {
        setPageSize(newSize);
        if (onRowsPerPageChange) {
            onRowsPerPageChange(newSize);
        }
    };

    return (
        <Box sx={{
            height: 600,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
        }} ref={ref}>
            <DataGrid
                rows={muiRows}
                columns={muiColumns}
                hideFooter
                disableColumnFilter
                checkboxSelection
                disableRowSelectionOnClick
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
        </Box>
    );
}
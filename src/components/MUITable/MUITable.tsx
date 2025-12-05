import React, { useMemo, useState, useRef } from 'react';
import Box from '@mui/material/Box';
import { DataGrid, GridPaginationModel } from '@mui/x-data-grid';
import { ColumnDefinition } from '../../framework/column-definition.tsx';
import convertColumnsToMUI from './convertColumnsToMUI.ts';
import convertDataToMUIRows from './convertDataToMUIRows.ts';

type TableProps = {
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][];
    ref?: React.Ref<any>;
    rowsPerPageOptions: number[];
    onRowsPerPageChange?: (value: number) => void;
};

export default function MUIDataGrid({
    columns,
    data,
    ref,
    rowsPerPageOptions,
    onRowsPerPageChange
}: TableProps) {
    const [pageSize, setPageSize] = useState(rowsPerPageOptions[0]);
    const previousPageSize = useRef(pageSize);

    const muiColumns = useMemo(() => {
        return convertColumnsToMUI(columns);
    }, [columns]);

    const muiRows = useMemo(() => {
        return convertDataToMUIRows(data, columns);
    }, [data, columns]);

    const handlePaginationModelChange = (newModel: GridPaginationModel) => {
        if (newModel.pageSize !== previousPageSize.current) {
            previousPageSize.current = newModel.pageSize;
            setPageSize(newModel.pageSize);
            if (onRowsPerPageChange) {
                onRowsPerPageChange(newModel.pageSize);
            }
        }
    };

    return (
        <Box sx={{ height: 400, width: '100%' }} ref={ref}>
            <DataGrid
                rows={muiRows}
                columns={muiColumns}
                paginationModel={{ page: 0, pageSize }}
                onPaginationModelChange={handlePaginationModelChange}
                pageSizeOptions={rowsPerPageOptions}
                disableColumnFilter
                checkboxSelection
                disableRowSelectionOnClick
            />
        </Box>
    );
}
import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';
import { ColumnDefinition } from '../../framework/column-definition.tsx';
import convertColumnsToMUI from './convertColumnsToMUI.ts';
import convertDataToMUIRows from './convertDataToMUIRows.ts';

type TableProps = {
    columns: ColumnDefinition[];
    data: Record<string, unknown>[][];
    ref?: React.Ref<any>;
    rowsPerPageOptions: number[];
};

export default function MUIDataGrid({
    columns,
    data,
    ref,
    rowsPerPageOptions
}: TableProps) {

    const muiColumns = useMemo(() => {
        return convertColumnsToMUI(columns);
    }, [columns]);

    const muiRows = useMemo(() => {
        return convertDataToMUIRows(data, columns);
    }, [data, columns]);

    return (
        <Box sx={{ height: 400, width: '100%' }} ref={ref}>
            <DataGrid
                rows={muiRows}
                columns={muiColumns}
                initialState={{
                    pagination: {
                        paginationModel: {
                            pageSize: rowsPerPageOptions[0] ?? 20,
                        },
                    },
                }}
                pageSizeOptions={rowsPerPageOptions}
                disableColumnFilter
                checkboxSelection
                disableRowSelectionOnClick
            />
        </Box>
    );
}

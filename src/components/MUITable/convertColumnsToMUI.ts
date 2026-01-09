import { createElement } from 'react';
import { GridColDef } from '@mui/x-data-grid';
import { minorToMajor, majorToMinor } from '../../framework/currency';
import { ColumnDefinition } from '../../framework/column-definition';
import {
    FlexRow,
    FlexColumn,
    DateTime
} from '../../framework/cell-renderer-components/LayoutHelpers';
import { Mapping } from '../../framework/cell-renderer-components/Mapping';
import CurrencyAmount from '../../framework/cell-renderer-components/CurrencyAmount';
import Link from '../../framework/cell-renderer-components/Link';
import Chip from '@mui/material/Chip';

export default function convertColumnsToMUI(columns: ColumnDefinition[]): GridColDef[] {
    return columns
        .filter(c => c.type === 'tableColumn')
        .map((column, index) => ({
            field: `${index}`,
            headerName: column.name,
            width: column.width ?? 150,
            align: column.align ?? 'left',
            headerAlign: column.headerAlign ?? 'left',

            renderCell: (params) => {
                const rowArray = params.row;
                const cellValue = rowArray[index];

                if (typeof column.cellRenderer === 'function') {
                    // TODO refactor this after moving MUI table to finance project
                    const props = {
                        data: cellValue,
                        setFilterState: () => {},
                        applyFilters: () => {},
                        updateFilterById: () => {},
                        createElement,
                        components: {
                            Badge: Chip as any,
                            FlexRow,
                            FlexColumn,
                            Mapping,
                            DateTime,
                            CurrencyAmount,
                            Link
                        },
                        currency: {
                            minorToMajor,
                            majorToMinor
                        },
                        columnDefinition: column
                    };

                    return column.cellRenderer(props);
                }

                return cellValue;
            }
        }));
}

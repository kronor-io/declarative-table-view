import { ColumnDefinition } from '../../framework/column-definition.tsx';
import { GridColDef } from '@mui/x-data-grid';
import { createElement } from 'react';
import { minorToMajor, majorToMinor } from '../../framework/currency.ts';
import {
    FlexRow,
    FlexColumn,
    DateTime
} from '../../framework/cell-renderer-components/LayoutHelpers.tsx';
import { Mapping } from '../../framework/cell-renderer-components/Mapping.tsx';
import CurrencyAmount from '../../framework/cell-renderer-components/CurrencyAmount.tsx';
import Link from '../../framework/cell-renderer-components/Link.tsx';
import Chip from '@mui/material/Chip';

export default function convertColumnsToMUI(columns: ColumnDefinition[]): GridColDef[] {
    return columns
        .filter(c => c.type === 'tableColumn')
        .map((column, index) => ({
            field: `${index}`,
            headerName: column.name,
            width: column.width ?? 250,
            align: column.align ?? 'left',
            headerAlign: column.headerAlign ?? 'left',

            renderCell: (params) => {
                const rowArray = params.row;
                const cellValue = rowArray[index];

                if (typeof column.cellRenderer === 'function') {
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
        })
    );
}

import { ColumnDefinition } from '../../framework/column-definition.tsx';
import { GridColDef } from '@mui/x-data-grid';
import { createElement } from 'react';
import { minorToMajor, majorToMinor } from '../../framework/currency.ts';
import {
    FlexRow,
    FlexColumn,
    DateTime
} from '../../framework/cell-renderer-components/LayoutHelpers.tsx';
import { Mapping } from "../../framework/cell-renderer-components/Mapping.tsx";
import CurrencyAmount from "../../framework/cell-renderer-components/CurrencyAmount.tsx";
import Link from "../../framework/cell-renderer-components/Link.tsx";
import { Tag } from 'primereact/tag';

export default function convertColumnsToMUI(columns: ColumnDefinition[]): GridColDef[] {
    return columns
        .filter(c => c.type === 'tableColumn')
        .map((column, index) => {
            const isCurrencyColumn = column.name.toLowerCase().includes('amount');

            return {
                field: `col_${index}`,
                headerName: column.name,
                width: 150,
                flex: 1,
                sortable: true,
                filterable: false,

                renderCell: (params) => {
                    if (isCurrencyColumn) { return JSON.stringify(params.value) }
                    if (typeof column.cellRenderer === 'function') {
                        const props = {
                            data: params.value,
                            setFilterState: () => {},
                            applyFilters: () => {},
                            updateFilterById: () => {},
                            createElement,

                            components: {
                                Badge: Tag,
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

                    return params.value;
                }
            };
        });
}

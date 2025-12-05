import { ColumnDefinition } from '../../framework/column-definition.tsx';
import { GridColDef } from '@mui/x-data-grid';

export default function convertColumnsToMUI(columns: ColumnDefinition[]): GridColDef[] {
    return columns
        .filter(column => column.type === 'tableColumn')
        .map((column, index) => ({
            field: `col_${index}`,
            headerName: column.name,
            width: 150,
            flex: 1,
            sortable: true,
            filterable: false,
        }));
}

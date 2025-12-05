import { ColumnDefinition } from '../../framework/column-definition.tsx';

export default function convertDataToMUIRows(data: Record<string, unknown>[][], columns: ColumnDefinition[]): any[] {
    if (!data || !columns) return [];

    const tableColumns = columns.filter(column => column.type === 'tableColumn');

    return data.map((rowArray, rowIndex) => {
        const rowObject: Record<string, unknown> = {
            id: rowIndex + 1,
        };

        tableColumns.forEach((_, colIndex) => {
            const cellData = rowArray[colIndex];
            rowObject[`col_${colIndex}`] = cellData ?
                (typeof cellData === 'object' ? JSON.stringify(cellData) : cellData) :
                null;
        });

        return rowObject;
    });
}

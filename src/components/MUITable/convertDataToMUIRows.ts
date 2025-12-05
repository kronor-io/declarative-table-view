import { ColumnDefinition } from '../../framework/column-definition.tsx';

export default function convertDataToMUIRows(data: Record<string, unknown>[][], columns: ColumnDefinition[]): any[] {
    if (!data || !columns) return [];

    const tableColumns = columns.filter(column => column.type === 'tableColumn');

    return data.map((rowArray, rowIndex) => {
        const rowObject: Record<string, unknown> = {
            id: rowIndex + 1,
            originalData: rowArray
        };

        tableColumns.forEach((_, colIndex) => {
            rowObject[`col_${colIndex}`] = rowArray[colIndex] ?? null;
        });

        return rowObject;
    });
}

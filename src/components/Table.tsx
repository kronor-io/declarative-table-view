import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnDefinition } from '../framework/column-definition';

type TableProps = {
  columns: ColumnDefinition[];
  data: Record<string, any>[];
};

// Helper to extract values for a column from a row
const getColumnValues = (row: Record<string, any>, column: ColumnDefinition) => {
  const values: Record<string, any> = {};
  column.data.forEach(pathStr => {
    const path = pathStr.split('.');
    let value = row;
    for (const p of path) {
      value = value?.[p];
    }
    values[pathStr] = value;
  });
  return values;
};

function Table({ columns, data }: TableProps) {
  return (
    <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines size='small'>
      {columns.map((column, colIdx) => (
        <Column
          key={colIdx}
          header={column.name}
          body={rowData => column.cellRenderer({ data: getColumnValues(rowData, column) })}
        />
      ))}
    </DataTable>
  );
}

export default Table;

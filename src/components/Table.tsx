import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnDefinition } from '../framework/column-definition';

type TableProps<CellRendererContext = unknown> = {
  columns: ColumnDefinition<CellRendererContext>[];
  data: Record<string, unknown>[][]; // Array of rows, each row is an array of values for the columns
  noDataRowsComponent: React.ReactNode;
  cellRendererContext?: CellRendererContext; // Context passed to all cell renderers
};

function Table<CellRendererContext = unknown>({ columns, data, noDataRowsComponent, cellRendererContext }: TableProps<CellRendererContext>) {
  return (
    <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines size='small' emptyMessage={noDataRowsComponent}>
      {columns.map((column, columnIndex) => (
        <Column
          key={columnIndex}
          header={column.name}
          body={rowData => column.cellRenderer({ data: rowData[columnIndex], context: cellRendererContext })}
        />
      ))}
    </DataTable>
  );
}

export default Table;

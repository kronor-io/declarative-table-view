import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnDefinition } from '../framework/column-definition';

type TableProps = {
  columns: ColumnDefinition[];
  data: Record<string, any>[];
  noDataRowsComponent: React.ReactNode;
};

function Table({ columns, data, noDataRowsComponent }: TableProps) {
  return (
    <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines size='small' emptyMessage={noDataRowsComponent}>
      {columns.map((column, columnIndex) => (
        <Column
          key={columnIndex}
          header={column.name}
          body={rowData => column.cellRenderer({ data: rowData[columnIndex] })}
        />
      ))}
    </DataTable>
  );
}

export default Table;

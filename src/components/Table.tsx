import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnDefinition } from '../framework/column-definition';
import { FilterFormState } from './FilterForm';
import { NoRowsComponent } from '../framework/view';

type TableProps<CellRendererContext = unknown> = {
  columns: ColumnDefinition<CellRendererContext>[];
  data: Record<string, unknown>[][]; // Array of rows, each row is an array of values for the columns
  noRowsComponent?: NoRowsComponent; // The noRowsComponent function
  cellRendererContext?: CellRendererContext; // Context passed to all cell renderers
  setFilterState: (filterState: FilterFormState[]) => void; // Function to update filter state
  filterState: FilterFormState[]; // Current filter state
  fetchData: () => void; // Function to fetch data
};

function Table<CellRendererContext = unknown>({
  columns,
  data,
  noRowsComponent,
  cellRendererContext,
  setFilterState,
  filterState,
  fetchData
}: TableProps<CellRendererContext>) {
  // Create wrapped setFilterState that provides current state to updater function
  const wrappedSetFilterState = (updater: (currentState: FilterFormState[]) => FilterFormState[]) => {
    const newState = updater(filterState);
    setFilterState(newState);
  };

  // Instantiate the noRowsComponent if it exists
  const noDataRowsComponent = noRowsComponent
    ? noRowsComponent({
      filterState,
      setFilterState: wrappedSetFilterState,
      fetchData
    })
    : null;

  return (
    <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines size='small' emptyMessage={noDataRowsComponent}>
      {columns.map((column, columnIndex) => (
        <Column
          key={columnIndex}
          header={column.name}
          body={rowData => column.cellRenderer({
            data: rowData[columnIndex],
            context: cellRendererContext,
            setFilterState: wrappedSetFilterState
          })}
        />
      ))}
    </DataTable>
  );
}

export default Table;

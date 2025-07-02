import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnDefinition, DataQuery } from '../framework/column-definition';

type TableProps = {
  columns: ColumnDefinition[];
  data: Record<string, any>[];
  noDataRowsComponent: React.ReactNode;
};

// Helper to extract values for a column from a row
const getColumnValues = (row: Record<string, any>, column: ColumnDefinition) => {
  const values: Record<string, any> = {};

  const extractValue = (dataQuery: DataQuery) => {
    if (dataQuery.type === 'field') {
      const path = dataQuery.path.split('.');
      let value: any = row;
      for (const p of path) {
        value = value?.[p];
      }
      values[dataQuery.path] = value;
    } else if (dataQuery.type === 'queryConfigs') {
      const pathKey = dataQuery.configs.map(c => c.data).join('.');

      const extract = (currentValue: any, configs: (typeof dataQuery.configs)): any => {
        if (configs.length === 0) {
          return currentValue;
        }

        if (currentValue === undefined || currentValue === null) {
          return undefined;
        }

        const [currentConfig, ...remainingConfigs] = configs;

        if (Array.isArray(currentValue)) {
          return currentValue.flatMap(item => extract(item, configs));
        }

        if (typeof currentValue === 'object' && currentConfig.data in currentValue) {
          const nextValue = currentValue[currentConfig.data];
          return extract(nextValue, remainingConfigs);
        }

        return undefined;
      };

      values[pathKey] = extract(row, dataQuery.configs);
    }
  };

  column.data.forEach(extractValue);
  return values;
};

function Table({ columns, data, noDataRowsComponent }: TableProps) {
  return (
    <DataTable value={data} tableStyle={{ minWidth: '50rem' }} showGridlines size='small' emptyMessage={noDataRowsComponent}>
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

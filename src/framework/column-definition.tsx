import { ReactNode, createElement } from "react";
import { Center, FlexRow, FlexColumn } from "../components/LayoutHelpers";
import { FilterFormState } from "../components/FilterForm";
import { Tag } from 'primereact/tag';

export type CellRendererProps = {
    data: Record<string, any>;
    setFilterState: (updater: (currentState: FilterFormState[]) => FilterFormState[]) => void; // Function to update filter state
    applyFilters: () => void; // Function to trigger data fetch with current filter state
    createElement: typeof createElement; // React createElement function
    components: {
        Badge: typeof Tag; // PrimeReact Tag component exposed as Badge for user convenience
        FlexRow: typeof FlexRow; // Horizontal layout component
        FlexColumn: typeof FlexColumn; // Vertical layout component
    };
};

export type CellRenderer = (props: CellRendererProps) => ReactNode;

export type OrderByConfig = {
    key: string; // data key to order by
    direction: 'ASC' | 'DESC';
};

// Tagged ADT for QueryConfig: either a path or a config group
export type Field = {
    type: 'field';
    path: string; // dot-separated data path
};

export type QueryConfig = {
    field: string
    path?: string; // path for querying inside JSON columns
    orderBy?: OrderByConfig | OrderByConfig[];
    limit?: number;
}

export type QueryConfigs = {
    type: 'queryConfigs'
    configs: QueryConfig[]
};

// Field alias support - wraps any FieldQuery with an alias name
export type FieldAlias = {
    type: 'fieldAlias';
    alias: string; // the alias name to use in GraphQL
    field: FieldQuery; // the underlying field query
};

export type FieldQuery = Field | QueryConfigs | FieldAlias;

// Helper to create a Field
export function field(path: string): FieldQuery {
    return { type: 'field', path };
}

// Helper to create QueryConfigs
export function queryConfigs(configs: QueryConfig[]): FieldQuery {
    return { type: 'queryConfigs', configs };
}

// Helper to create a FieldAlias
export function fieldAlias(alias: string, fieldQuery: FieldQuery): FieldQuery {
    return { type: 'fieldAlias', alias, field: fieldQuery };
}

export type ColumnDefinition = {
    data: FieldQuery[];
    name: string; // column display name
    cellRenderer: CellRenderer;
};

// Default function: returns the only value in the object
export const defaultCellRenderer: CellRenderer = ({ data }) => <Center>{Object.values(data)[0]}</Center>;

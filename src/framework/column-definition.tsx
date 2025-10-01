import { ReactNode, createElement } from "react";
import { FlexRow, FlexColumn, DateTime } from "./cell-renderer-components/LayoutHelpers";
import { CurrencyAmount } from './cell-renderer-components/CurrencyAmount';
import { majorToMinor, minorToMajor } from './currency';
import { Mapping } from "./cell-renderer-components/Mapping";
import { Link } from "./cell-renderer-components/Link";
import { Tag } from 'primereact/tag';
import { FilterState } from "./state";
import { FilterId } from "./filters";

export type CellRendererProps = {
    data: Record<string, any>;
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void; // Function to update filter state
    applyFilters: () => void; // Function to trigger data fetch with current filter state
    updateFilterById: (filterId: FilterId, updater: (currentValue: any) => any) => void; // Narrow helper to update a specific filter by id
    createElement: typeof createElement; // React createElement function
    components: {
        Badge: typeof Tag; // PrimeReact Tag component exposed as Badge for user convenience
        FlexRow: typeof FlexRow; // Horizontal layout component
        FlexColumn: typeof FlexColumn; // Vertical layout component
        Mapping: typeof Mapping; // Generic mapping component for displaying mapped values
        DateTime: typeof DateTime; // Date formatting component
        CurrencyAmount: typeof CurrencyAmount; // Currency formatting component
        Link: typeof Link; // Link component for creating hyperlinks
    };
    currency: {
        minorToMajor: typeof minorToMajor;
        majorToMinor: typeof majorToMinor;
    }
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

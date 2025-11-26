import { ReactNode, createElement } from "react";
import type { HasuraCondition } from './graphql';
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
    /**
     * The full column definition for the current cell. Allows renderers to
     * introspect the FieldQuery definitions to derive display output generically.
     */
    columnDefinition: TableColumnDefinition;
};

export type CellRenderer = (props: CellRendererProps) => ReactNode;

export type OrderByConfig = {
    key: string; // data key to order by
    direction: 'ASC' | 'DESC';
};

export type FieldAlias = {
    type: 'fieldAlias';
    alias: string; // the alias name to use in GraphQL
    field: FieldQuery; // the underlying field query
};

export type ValueQuery = {
    type: 'valueQuery';
    field: string;
    path?: string; // path for querying inside JSON columns
}

export type ObjectQuery = {
    type: 'objectQuery';
    field: string;
    path?: string; // path for querying inside JSON columns
    selectionSet: Query[];
}

export type ArrayQuery = {
    type: 'arrayQuery';
    field: string;
    path?: string; // path for querying inside JSON columns
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraCondition;
    selectionSet: Query[];
}

export type Query = ValueQuery | ObjectQuery | ArrayQuery;

export type FieldQuery = Query | FieldAlias;

// Helper to create a FieldAlias
export function fieldAlias(alias: string, fieldQuery: FieldQuery): FieldQuery {
    return { type: 'fieldAlias', alias, field: fieldQuery };
}


export type TableColumnDefinition = {
    type: 'tableColumn';
    data: FieldQuery[];
    name: string; // column display name
    cellRenderer: CellRenderer;
};

// data-only column included in the GraphQL selection set but not rendered.
export type VirtualColumnDefinition = {
    type: 'virtualColumn';
    data: FieldQuery[];
};

export type ColumnDefinition = TableColumnDefinition | VirtualColumnDefinition;

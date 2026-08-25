import { ReactNode, createElement } from "react";
import {
    FlexRow,
    FlexColumn,
    DateTime,
} from "./cell-renderer-components/LayoutHelpers";
import { CurrencyAmount } from "./cell-renderer-components/CurrencyAmount";
import { majorToMinor, minorToMajor } from "./currency";
import { Mapping } from "./cell-renderer-components/Mapping";
import { Link } from "./cell-renderer-components/Link";
import { Tag } from "primereact/tag";
import type { ColumnProps } from "primereact/column";
import type { FilterState } from "./state";
import type { FilterFormState } from "./filter-form-state";
import type { FilterId } from "./filters";
import type { FieldQuery } from "@kronor/hasura-graphql";
import {
    getFieldQueriesOrderBy,
    orderByIsSelectedField,
} from "@kronor/hasura-graphql";
import type {
    DataFromFieldQueriesSafe,
    OrderableFieldPath,
} from "@kronor/hasura-graphql";

// The query AST and its row-typed derivations are shared with other
// declarative, GraphQL-driven UIs; only the table/rendering layer lives here.
export type {
    OrderByConfig,
    FieldAlias,
    ValueQuery,
    ObjectQuery,
    ArrayQuery,
    Query,
    FieldQuery,
    OrderableFieldPath,
    DataFromQuery,
    DataFromFieldQuery,
    DataFromSelectionSet,
    DataFromFieldQueries,
    DataFromFieldQueriesSafe,
    DataFromQueryForRow,
    DataFromFieldQueryForRow,
    DataFromSelectionSetForRow,
    DataFromFieldQueriesForRow,
    DataFromFieldQueriesForRowSafe,
    ValueQueryForRow,
    ObjectQueryForRow,
    ArrayQueryForRow,
    QueryForRow,
    QueryForRowSafe,
    FieldAliasForRow,
    FieldQueryForRow,
    FieldQueryForRowSafe,
    ValidateFieldQueriesForRow,
} from "@kronor/hasura-graphql";

export { fieldAlias, getOrderableFieldPaths, orderByIsSelectedField } from "@kronor/hasura-graphql";

export type CellRendererProps<
    Data extends Record<string, any> = Record<string, any>,
> = {
    data: Data;
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void; // Function to update filter state
    applyFilters: () => void; // Function to trigger data fetch with current filter state
    updateFilterById: (
        filterId: FilterId,
        updater: (currentValue: FilterFormState) => FilterFormState,
    ) => void; // Narrow helper to update a specific filter by id
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
    };
    /**
     * The full column definition for the current cell. Allows renderers to
     * introspect the FieldQuery definitions to derive display output generically.
     */
    columnDefinition: TableColumnDefinition;
};

// Intentionally bivariant so strongly-typed cell renderers remain assignable
// to framework-level column containers (e.g. `ColumnDefinition[]`).
export type CellRenderer<
    Data extends Record<string, any> = Record<string, any>,
> = {
    bivarianceHack(props: CellRendererProps<Data>): ReactNode;
}["bivarianceHack"];

export type TableColumnDefinitionFooter = ColumnProps["footer"];

export type ColumnId = string;

export type TableColumnDefinition<
    FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
    CellData extends Record<string, any> = DataFromFieldQueriesSafe<FieldQueries>,
> = {
    type: "tableColumn";
    id: ColumnId;
    data: FieldQueries;
    name: string; // column display name
    footer?: TableColumnDefinitionFooter;
    orderBy?: OrderableFieldPath<FieldQueries>; // GraphQL field to order by when the header is sorted
    cellRenderer: CellRenderer<CellData>;
};

// data-only column included in the GraphQL selection set but not rendered.
export type VirtualColumnDefinition<
    FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
> = {
    type: "virtualColumn";
    id: ColumnId;
    data: FieldQueries;
};

export type ColumnDefinition = TableColumnDefinition | VirtualColumnDefinition;

export function getColumnOrderBy(column: TableColumnDefinition): string | undefined {
    if (column.orderBy !== undefined) {
        if (!orderByIsSelectedField(column.data, column.orderBy)) {
            throw new Error(`Column "${column.id}" orderBy "${column.orderBy}" must reference a scalar field selected by the column data`);
        }

        return column.orderBy;
    }

    return getFieldQueriesOrderBy(column.data);
}

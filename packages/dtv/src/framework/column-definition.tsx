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
import type { FilterState } from "./state";
import type { FilterFormState } from "./filter-form-state";
import type { FilterId } from "./filters";
import type * as Orderable from "./orderable";
import type { FieldQuery } from "@kronor/hasura-graphql";
import type { DataFromFieldQueriesSafe } from "@kronor/hasura-graphql";
import type { AggregateDefinitions, AggregateStates } from "./aggregates";

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

export { fieldAlias } from "@kronor/hasura-graphql";

/** What a cell renderer and a footer renderer get, whatever their column. */
type RendererBaseProps<Aggregates extends object> = {
    /** The states of the aggregates the column declares (`aggregates`), by name. */
    aggregates: Aggregates;
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
     * The full column definition. Allows renderers to introspect the FieldQuery
     * definitions to derive display output generically.
     */
    columnDefinition: TableColumnDefinition;
};

export type CellRendererProps<
    Data extends object = Record<string, unknown>,
    Aggregates extends object = AggregateStates,
> = RendererBaseProps<Aggregates> & {
    data: Data;
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void; // Function to update filter state
    applyFilters: () => void; // Function to trigger data fetch with current filter state
    updateFilterById: (
        filterId: FilterId,
        updater: (currentValue: FilterFormState) => FilterFormState,
    ) => void; // Narrow helper to update a specific filter by id
};

// Intentionally bivariant so strongly-typed cell renderers remain assignable
// to framework-level column containers (e.g. `ColumnDefinition[]`).
export type CellRenderer<
    Data extends object = Record<string, unknown>,
    Aggregates extends object = AggregateStates,
> = {
    bivarianceHack(props: CellRendererProps<Data, Aggregates>): ReactNode;
}["bivarianceHack"];

/** What a footer renderer gets: the states of the aggregates its column declares. */
export type FooterRendererProps<
    Aggregates extends object = AggregateStates,
> = RendererBaseProps<Aggregates>;

// Bivariant, like `CellRenderer`
export type FooterRenderer<
    Aggregates extends object = AggregateStates,
> = {
    bivarianceHack(props: FooterRendererProps<Aggregates>): ReactNode;
}["bivarianceHack"];

export type ColumnId = string;

export type TableColumnDefinition<
    FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
    CellData extends object = DataFromFieldQueriesSafe<FieldQueries>,
    Aggregates extends AggregateDefinitions = AggregateDefinitions,
> = {
    type: "tableColumn";
    id: ColumnId;
    data: FieldQueries;
    name: string; // column display name
    /**
     * The view's aggregates the column reads, by the names the view gives them. Its cell
     * and footer renderers get their states as `aggregates`.
     */
    aggregates?: Aggregates;
    /** Renders the column's footer: static content, or the aggregates the column reads. */
    footerRenderer?: FooterRenderer<AggregateStates<Aggregates>>;
    // GraphQL field to order by when the header is sorted, or `Orderable.notOrderable` for a
    // column that cannot be sorted. Left out, it is the column's field when its data is a single scalar.
    orderBy?: Orderable.OrderableFieldPath<FieldQueries> | Orderable.NotOrderable;
    cellRenderer: CellRenderer<CellData, AggregateStates<Aggregates>>;
};

// data-only column included in the GraphQL selection set but not rendered.
export type VirtualColumnDefinition<
    FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
    Data extends object = DataFromFieldQueriesSafe<FieldQueries>,
> = {
    type: "virtualColumn";
    id: ColumnId;
    data: FieldQueries;
    /**
     * Type only, never set: the data the column adds to its row, typed against the view's
     * row type (see `SimplifiedRow`). A table column carries it in its cell renderer.
     */
    rowData?: Data;
};

export type ColumnDefinition = TableColumnDefinition | VirtualColumnDefinition;

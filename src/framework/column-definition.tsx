import { ReactNode, createElement } from "react";
import type { HasuraCondition } from "./graphql";
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
import { FilterState } from "./state";
import { FilterId } from "./filters";
import type { EmptyObject, Simplify, UnionToIntersection } from "./typelevel";

export type CellRendererProps<
  Data extends Record<string, any> = Record<string, any>,
> = {
  data: Data;
  setFilterState: (updater: (currentState: FilterState) => FilterState) => void; // Function to update filter state
  applyFilters: () => void; // Function to trigger data fetch with current filter state
  updateFilterById: (
    filterId: FilterId,
    updater: (currentValue: any) => any,
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

export type ColumnId = string;

export type OrderByConfig = {
  key: string; // data key to order by
  direction: "ASC" | "DESC";
};

export type FieldAlias = {
  type: "fieldAlias";
  alias: string; // the alias name to use in GraphQL
  field: FieldQuery; // the underlying field query
};

export type ValueQuery = {
  type: "valueQuery";
  field: string;
  path?: string; // path for querying inside JSON columns
};

export type ObjectQuery = {
  type: "objectQuery";
  field: string;
  path?: string; // path for querying inside JSON columns
  selectionSet: Query[];
};

export type ArrayQuery = {
  type: "arrayQuery";
  field: string;
  path?: string; // path for querying inside JSON columns
  orderBy?: OrderByConfig | OrderByConfig[];
  distinctOn?: string[];
  limit?: number;
  where?: HasuraCondition;
  selectionSet: Query[];
};

export type Query = ValueQuery | ObjectQuery | ArrayQuery;

export type FieldQuery = Query | FieldAlias;

type ValueFromObjectQuery<Q extends Query> = Q extends {
  type: "objectQuery";
  selectionSet: infer SelectionSet extends readonly Query[];
}
  ? DataFromSelectionSet<SelectionSet>
  : unknown;

type ValueFromArrayQuery<Q extends Query> = Q extends {
  type: "arrayQuery";
  selectionSet: infer SelectionSet extends readonly Query[];
}
  ? Array<DataFromSelectionSet<SelectionSet>>
  : unknown;

type ValueFromQuery<Q extends Query> = Q extends { type: "valueQuery" }
  ? unknown
  : Q extends { type: "objectQuery" }
    ? ValueFromObjectQuery<Q>
    : Q extends { type: "arrayQuery" }
      ? ValueFromArrayQuery<Q>
      : unknown;

type ValueFromFieldQuery<FQ extends FieldQuery> = FQ extends FieldAlias
  ? ValueFromFieldQuery<FQ["field"]>
  : FQ extends Query
    ? ValueFromQuery<FQ>
    : unknown;

type DataFromValueQuery<Q extends Query> = Q extends {
  type: "valueQuery";
  field: infer Field extends string;
}
  ? { [K in Field]: unknown }
  : EmptyObject;

type DataFromObjectQuery<Q extends Query> = Q extends {
  type: "objectQuery";
  field: infer Field extends string;
  selectionSet: infer SelectionSet extends readonly Query[];
}
  ? { [K in Field]: DataFromSelectionSet<SelectionSet> }
  : EmptyObject;

type DataFromArrayQuery<Q extends Query> = Q extends {
  type: "arrayQuery";
  field: infer Field extends string;
  selectionSet: infer SelectionSet extends readonly Query[];
}
  ? { [K in Field]: Array<DataFromSelectionSet<SelectionSet>> }
  : EmptyObject;

export type DataFromQuery<Q extends Query> = Q extends { type: "valueQuery" }
  ? DataFromValueQuery<Q>
  : Q extends { type: "objectQuery" }
    ? DataFromObjectQuery<Q>
    : Q extends { type: "arrayQuery" }
      ? DataFromArrayQuery<Q>
      : EmptyObject;

export type DataFromFieldQuery<FQ extends FieldQuery> = FQ extends FieldAlias
  ? { [K in FQ["alias"]]: ValueFromFieldQuery<FQ["field"]> }
  : FQ extends Query
    ? DataFromQuery<FQ>
    : EmptyObject;

export type DataFromSelectionSet<SelectionSet extends readonly Query[]> =
  Simplify<UnionToIntersection<DataFromQuery<SelectionSet[number]>>>;

export type DataFromFieldQueries<FieldQueries extends readonly FieldQuery[]> =
  Simplify<UnionToIntersection<DataFromFieldQuery<FieldQueries[number]>>>;

type ExtractTopLevelKey<FQ extends FieldQuery> = FQ extends {
  type: "fieldAlias";
  alias: infer Alias extends string;
}
  ? Alias
  : FQ extends { field: infer Field extends string }
    ? Field
    : never;

type HasWideTopLevelKeys<FieldQueries extends readonly FieldQuery[]> =
  string extends ExtractTopLevelKey<FieldQueries[number]> ? true : false;

/**
 * Safe variant that avoids deep conditional-type expansion when the column's
 * FieldQuery[] has been widened to generic `string` keys.
 */
export type DataFromFieldQueriesSafe<
  FieldQueries extends readonly FieldQuery[],
> =
  HasWideTopLevelKeys<FieldQueries> extends true
    ? Record<string, any>
    : DataFromFieldQueries<FieldQueries>;

// Helper to create a FieldAlias
export function fieldAlias<const Alias extends string, const FQ extends FieldQuery>(
    alias: Alias,
    fieldQuery: FQ,
): FieldAlias & { alias: Alias; field: FQ } {
    return { type: "fieldAlias", alias, field: fieldQuery };
}

export type TableColumnDefinition<
  FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
> = {
  type: "tableColumn";
  id: ColumnId;
  data: FieldQueries;
  name: string; // column display name
  cellRenderer: CellRenderer<DataFromFieldQueriesSafe<FieldQueries>>;
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

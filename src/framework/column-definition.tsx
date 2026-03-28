import { ReactNode, createElement } from "react";
import type { HasuraFilterExpression } from "./graphql";
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
import type { EmptyObject, Simplify, UnionToIntersection } from "./typelevel";

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
    selectionSet: readonly Query[];
};

export type ArrayQuery = {
    type: "arrayQuery";
    field: string;
    path?: string; // path for querying inside JSON columns
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraFilterExpression;
    selectionSet: readonly Query[];
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

type PreserveNull<TOriginal, TMapped> = null extends TOriginal ? TMapped | null : TMapped;
type PreserveUndefined<TOriginal, TMapped> = undefined extends TOriginal ? TMapped | undefined : TMapped;
type PreserveNullish<TOriginal, TMapped> = PreserveUndefined<TOriginal, PreserveNull<TOriginal, TMapped>>;

type ValueFromObjectQueryForRow<
    Row,
    Q extends Query,
> = Q extends {
    type: "objectQuery";
    field: infer Field extends string;
    selectionSet: infer SelectionSet extends readonly Query[];
}
    ? Field extends keyof Row
    ? PreserveNullish<
        Row[Field],
        NonNullable<Row[Field]> extends object
        ? DataFromSelectionSetForRow<NonNullable<Row[Field]>, SelectionSet>
        : unknown
    >
    : unknown
    : unknown;

type ValueFromArrayQueryForRow<
    Row,
    Q extends Query,
> = Q extends {
    type: "arrayQuery";
    field: infer Field extends string;
    selectionSet: infer SelectionSet extends readonly Query[];
}
    ? Field extends keyof Row
    ? PreserveNullish<
        Row[Field],
        NonNullable<Row[Field]> extends ReadonlyArray<infer Elem>
        ? Array<PreserveNullish<Elem, DataFromSelectionSetForRow<NonNullable<Elem> extends object ? NonNullable<Elem> : Record<string, unknown>, SelectionSet>>>
        : unknown
    >
    : unknown
    : unknown;

type ValueFromQueryForRow<
    Row,
    Q extends Query,
> = Q extends { type: "valueQuery"; field: infer Field extends string }
    ? Row[Field & keyof Row]
    : Q extends { type: "objectQuery" }
    ? ValueFromObjectQueryForRow<Row, Q>
    : Q extends { type: "arrayQuery" }
    ? ValueFromArrayQueryForRow<Row, Q>
    : unknown;

type ValueFromFieldQueryForRow<
    Row,
    FQ extends FieldQuery,
> = FQ extends FieldAlias
    ? ValueFromFieldQueryForRow<Row, FQ["field"]>
    : FQ extends Query
    ? ValueFromQueryForRow<Row, FQ>
    : unknown;

type DataFromValueQueryForRow<
    Row,
    Q extends Query,
> = Q extends {
    type: "valueQuery";
    field: infer Field extends string;
}
    ? { [K in Field]: Row[K & keyof Row] }
    : EmptyObject;

type DataFromObjectQueryForRow<
    Row,
    Q extends Query,
> = Q extends {
    type: "objectQuery";
    field: infer Field extends string;
    selectionSet: infer SelectionSet extends readonly Query[];
}
    ? {
        [K in Field]: PreserveNullish<
            Row[Field & keyof Row],
            NonNullable<Row[Field & keyof Row]> extends object
            ? DataFromSelectionSetForRow<NonNullable<Row[Field & keyof Row]>, SelectionSet>
            : unknown
        >;
    }
    : EmptyObject;

type DataFromArrayQueryForRow<
    Row,
    Q extends Query,
> = Q extends {
    type: "arrayQuery";
    field: infer Field extends string;
    selectionSet: infer SelectionSet extends readonly Query[];
}
    ? {
        [K in Field]: PreserveNullish<
            Row[Field & keyof Row],
            NonNullable<Row[Field & keyof Row]> extends ReadonlyArray<infer Elem>
            ? Array<PreserveNullish<Elem, DataFromSelectionSetForRow<NonNullable<Elem> extends object ? NonNullable<Elem> : Record<string, unknown>, SelectionSet>>>
            : unknown
        >;
    }
    : EmptyObject;

export type DataFromQueryForRow<
    Row,
    Q extends Query,
> = Q extends { type: "valueQuery" }
    ? DataFromValueQueryForRow<Row, Q>
    : Q extends { type: "objectQuery" }
    ? DataFromObjectQueryForRow<Row, Q>
    : Q extends { type: "arrayQuery" }
    ? DataFromArrayQueryForRow<Row, Q>
    : EmptyObject;

export type DataFromFieldQueryForRow<
    Row,
    FQ extends FieldQuery,
> = FQ extends FieldAlias
    ? { [K in FQ["alias"]]: ValueFromFieldQueryForRow<Row, FQ["field"]> }
    : FQ extends Query
    ? DataFromQueryForRow<Row, FQ>
    : EmptyObject;

export type DataFromSelectionSetForRow<
    Row,
    SelectionSet extends readonly Query[],
> = Simplify<UnionToIntersection<DataFromQueryForRow<Row, SelectionSet[number]>>>;

export type DataFromFieldQueriesForRow<
    Row,
    FieldQueries extends readonly FieldQuery[],
> = Simplify<UnionToIntersection<DataFromFieldQueryForRow<Row, FieldQueries[number]>>>;

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

export type DataFromFieldQueriesForRowSafe<
    Row,
    FieldQueries extends readonly FieldQuery[],
> = HasWideTopLevelKeys<FieldQueries> extends true
    ? Record<string, any>
    : DataFromFieldQueriesForRow<Row, FieldQueries>;

type HasWideKeys<Row> = string extends keyof Row ? true : false;
type StringKeyOf<Row> = keyof Row & string;
type NonNullish<T> = Exclude<T, null | undefined>;
type ElemOf<T> = T extends ReadonlyArray<infer E> ? E : never;

type KeysMatching<Row, Constraint> = {
    [K in keyof Row]-?: NonNullish<Row[K]> extends Constraint ? K : never;
}[keyof Row];

type ArrayKeys<Row> = KeysMatching<Row, ReadonlyArray<any>>;
type ObjectKeys<Row> = {
    [K in keyof Row]-?: NonNullish<Row[K]> extends ReadonlyArray<any>
    ? never
    : NonNullish<Row[K]> extends object
    ? K
    : never;
}[keyof Row];

export type ValueQueryForRow<Row> = ValueQuery & {
    field: StringKeyOf<Row>;
};

export type ObjectQueryForRow<Row> = {
    [K in Extract<ObjectKeys<Row>, string>]: ObjectQuery & {
        field: K;
        selectionSet: readonly QueryForRowSafe<NonNullish<Row[K]>>[];
    };
}[Extract<ObjectKeys<Row>, string>];

export type ArrayQueryForRow<Row> = {
    [K in Extract<ArrayKeys<Row>, string>]: ArrayQuery & {
        field: K;
        selectionSet: readonly QueryForRowSafe<NonNullish<ElemOf<NonNullish<Row[K]>>>>[];
    };
}[Extract<ArrayKeys<Row>, string>];

export type QueryForRow<Row> =
    | ValueQueryForRow<Row>
    | ObjectQueryForRow<Row>
    | ArrayQueryForRow<Row>;

export type QueryForRowSafe<Row> = HasWideKeys<Row> extends true ? Query : QueryForRow<Row>;

export type FieldAliasForRow<Row> = FieldAlias & {
    field: FieldQueryForRowSafe<Row>;
};

export type FieldQueryForRow<Row> = QueryForRow<Row> | FieldAliasForRow<Row>;
export type FieldQueryForRowSafe<Row> = HasWideKeys<Row> extends true ? FieldQuery : FieldQueryForRow<Row>;

type IsTuple<T extends readonly unknown[]> = number extends T["length"] ? false : true;

type FieldOfQuery<Q extends Query> = Q extends { field: infer Field } ? Field : never;
type SelectionSetOfQuery<Q extends Query> = Q extends { selectionSet: infer SelectionSet extends readonly Query[] }
    ? SelectionSet
    : never;

type ValidateQueryForRow<Row, Q extends Query> = Q extends { type: "valueQuery" }
    ? FieldOfQuery<Q> extends StringKeyOf<Row>
    ? Q
    : never
    : Q extends { type: "objectQuery" }
    ? FieldOfQuery<Q> extends Extract<ObjectKeys<Row>, string>
    ? ValidateSelectionSetForRow<NonNullish<Row[FieldOfQuery<Q>]>, SelectionSetOfQuery<Q>> extends never
    ? never
    : Q
    : never
    : Q extends { type: "arrayQuery" }
    ? FieldOfQuery<Q> extends Extract<ArrayKeys<Row>, string>
    ? ValidateSelectionSetForRow<NonNullish<ElemOf<NonNullish<Row[FieldOfQuery<Q>]>>>, SelectionSetOfQuery<Q>> extends never
    ? never
    : Q
    : never
    : never;

type ValidateSelectionSetForRow<Row, SelectionSet extends readonly Query[]> = IsTuple<SelectionSet> extends true
    ? SelectionSet extends readonly []
    ? SelectionSet
    : SelectionSet extends readonly [infer Head, ...infer Tail]
    ? Head extends Query
    ? ValidateQueryForRow<Row, Head> extends never
    ? never
    : Tail extends readonly Query[]
    ? ValidateSelectionSetForRow<Row, Tail>
    : never
    : never
    : never
    : SelectionSet;

type ValidateFieldQueryForRow<Row, FQ extends FieldQuery> = FQ extends FieldAlias
    ? ValidateFieldQueryForRow<Row, FQ["field"]> extends never
    ? never
    : FQ
    : FQ extends Query
    ? ValidateQueryForRow<Row, FQ>
    : never;

type ValidateFieldQueriesTupleForRow<Row, FieldQueries extends readonly FieldQuery[]> = FieldQueries extends readonly []
    ? FieldQueries
    : FieldQueries extends readonly [infer Head, ...infer Tail]
    ? Head extends FieldQuery
    ? ValidateFieldQueryForRow<Row, Head> extends never
    ? never
    : Tail extends readonly FieldQuery[]
    ? ValidateFieldQueriesTupleForRow<Row, Tail>
    : never
    : never
    : never;

/**
 * Validates that every FieldQuery in FieldQueries only refers to keys present
 * on Row (recursively for nested selection sets).
 *
 * When FieldQueries is a tuple (typical inline literals), validation is strict.
 * When FieldQueries is a widened array type, validation is best-effort and
 * requires the element type to be compatible with row-aware query types.
 */
export type ValidateFieldQueriesForRow<Row, FieldQueries extends readonly FieldQuery[]> = IsTuple<FieldQueries> extends true
    ? ValidateFieldQueriesTupleForRow<Row, FieldQueries>
    : FieldQueries;

// Helper to create a FieldAlias
export function fieldAlias<const Alias extends string, const FQ extends FieldQuery>(
    alias: Alias,
    fieldQuery: FQ,
): FieldAlias & { alias: Alias; field: FQ } {
    return { type: "fieldAlias", alias, field: fieldQuery };
}

export type TableColumnDefinition<
    FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
    CellData extends Record<string, any> = DataFromFieldQueriesSafe<FieldQueries>,
> = {
    type: "tableColumn";
    id: ColumnId;
    data: FieldQueries;
    name: string; // column display name
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

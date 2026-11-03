import type { ReactNode, createElement } from 'react';
import type { CellRenderer, CellRendererProps, DataFromFieldQueriesSafe, FieldQuery } from './column-definition';
import { ColumnDefinition } from "./column-definition";
import { FilterGroups, FilterSchema } from "./filters";
import { FilterState } from "./state";
import { FilterFormState } from "./filter-form-state";
import { HasuraFilterExpression, HasuraOrderBy } from "./graphql";
import type { OrderDirection } from "./order-direction";
import type { ViewMigrationChain } from "./view-migrations";
import type { Simplify, UnionToIntersection } from "./typelevel";

export type NoRowsComponentProps = {
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void;
    filterState: FilterState;
    applyFilters: () => void;
    updateFilterById: (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => void;
};

export type NoRowsComponent = (props: NoRowsComponentProps) => ReactNode;

type RowExpansionRendererBaseProps = {
    row: SimplifiedRow;
    collapse: () => void;
    toggle: () => void;
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void;
    applyFilters: () => void;
    updateFilterById: (
        filterId: string,
        updater: (currentValue: FilterFormState) => FilterFormState,
    ) => void;
    createElement: typeof createElement;
    components: CellRendererProps['components'];
    currency: CellRendererProps['currency'];
};

/**
 * What a row expansion's `render` gets. A lazy expansion (`Lazy`) fetches its data when the
 * row is opened: while that loads, or when it failed, `data` holds only those of its fields
 * the table's own query has.
 */
export type RowExpansionRendererProps<
    Data extends object = Record<string, unknown>,
    Lazy extends boolean = false,
> = RowExpansionRendererBaseProps & (
    | { state: 'ready'; data: Data }
    | (Lazy extends true ? { state: 'loading' | 'error'; data: Partial<Data> } : never)
);

// Intentionally bivariant, like `CellRenderer`, so a typed expansion fits a view's
// `RowExpansionDefinition`.
export type RowExpansionRenderer<
    Data extends object = Record<string, unknown>,
    Lazy extends boolean = false,
> = {
    bivarianceHack(props: RowExpansionRendererProps<Data, Lazy>): ReactNode;
}["bivarianceHack"];

/**
 * Whether a row can be expanded. It runs before a lazy expansion has fetched anything, so a
 * lazy one gets only those of its fields the table's own query has.
 */
export type RowExpansionPredicate<
    Data extends object = Record<string, unknown>,
    Lazy extends boolean = false,
> = {
    bivarianceHack(args: { row: SimplifiedRow; data: Lazy extends true ? Partial<Data> : Data }): boolean;
}["bivarianceHack"];

/** A row expansion of a JSON view, which can be lazy or not. */
export type RowExpansionRuntimeEntry<
    Data extends object = Record<string, unknown>,
> = {
    render: RowExpansionRenderer<Data, boolean>;
    canExpand: RowExpansionPredicate<Data, boolean>;
};

type RowExpansionDefinitionBase<FieldQueries extends readonly FieldQuery[]> = {
    data: FieldQueries;
    mode: 'single' | 'multiple';
};

export type RowExpansionDefinition<
    FieldQueries extends readonly FieldQuery[] = readonly FieldQuery[],
    Data extends object = DataFromFieldQueriesSafe<FieldQueries>,
> =
    | RowExpansionDefinitionBase<FieldQueries> & {
        lazy?: false;
        render: RowExpansionRenderer<Data>;
        canExpand: RowExpansionPredicate<Data>;
    }
    | RowExpansionDefinitionBase<FieldQueries> & {
        lazy: true;
        render: RowExpansionRenderer<Data, true>;
        canExpand: RowExpansionPredicate<Data, true>;
    };


export type ViewId = string;

export type CollectionViewSource = {
    type: 'collection';
    collectionName: string;
};

export type FunctionViewSource = {
    type: 'function';
    functionName: string;
    args?: Record<string, unknown>;
};

export type ViewSource = CollectionViewSource | FunctionViewSource;

type ViewBase<Columns extends ColumnDefinition[]> = {
    title: string;
    id: ViewId;
    source: ViewSource;
    columnDefinitions: Columns;
    rowExpansion?: RowExpansionDefinition;
    filterGroups: FilterGroups;
    /** Optional default prompt shown in the AI Filter Assistant for this view. */
    defaultAIFilterPrompt?: string;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    paginationKey: string; // Field to use for cursor-based pagination
    /**
     * Optional direction for cursor-based pagination ordering on paginationKey.
     * Defaults to 'DESC' for backwards compatibility.
     */
    paginationDirection?: OrderDirection;
    noRowsComponent?: NoRowsComponent;
    // Optional static GraphQL conditions (Hasura boolean expressions) always applied in addition to user filters
    staticConditions?: HasuraFilterExpression[];
    // Optional static ordering entries always applied in addition to pagination ordering.
    // Each entry is a HasuraOrderBy object e.g. { createdAt: 'DESC' }
    // When the user sorts a column, that ordering leads and these entries trail it as
    // tie-breakers (minus any entry for the same field).
    // Pagination will still enforce an ordering on paginationKey (defaults to 'DESC') even if not provided here.
    staticOrdering?: HasuraOrderBy[];
    /**
     * The view definition's snapshots and the migrations between them, which take the user
     * data stored for the view to the definition's current revision. Generated by
     * `dtv definitions snapshot`.
     */
    migrations?: ViewMigrationChain;
};

/*
 * `Columns` is the view's column tuple when `view()` built it from typed columns, and plain
 * `ColumnDefinition[]` otherwise (a view parsed from JSON, or annotated as `View`). Only
 * `SimplifiedRow` reads it.
 */
export type CollectionView<Columns extends ColumnDefinition[] = ColumnDefinition[]> = ViewBase<Columns> & {
    source: CollectionViewSource;
};

export type FunctionView<Columns extends ColumnDefinition[] = ColumnDefinition[]> = ViewBase<Columns> & {
    source: FunctionViewSource;
};

export type View<Columns extends ColumnDefinition[] = ColumnDefinition[]> =
    | CollectionView<Columns>
    | FunctionView<Columns>;

// What a column adds to its row. A column that is not typed (its data is `Record<string, any>`)
// adds fields it does not name, so they are `unknown`, never `any`.
type ColumnRowData<Column> =
    Column extends { type: 'tableColumn'; cellRenderer: CellRenderer<infer CellData> }
    ? KnownFields<CellData>
    : Column extends { type: 'virtualColumn'; rowData?: infer Data }
    ? KnownFields<Exclude<Data, undefined>>
    : never;

type KnownFields<Data> = string extends keyof Data ? Record<string, unknown> : Data;

/**
 * A row of `V` as DTV hands it out, to `rowSelection.onRowSelectionChange` and
 * `rowClassFunction`: the data of every column merged into one object (see `simplifyRow`). It holds only what the columns select, not
 * the whole row type the view was declared against, so a field no column queries is not
 * on it. A view whose columns are not typed (parsed from JSON, or annotated as `View`) gives
 * `Record<string, unknown>`; a typed view with some untyped columns gets it merged in, so its
 * typed columns' fields keep their types and the rest are `unknown`. A union of views gives a
 * union of rows.
 */
export type SimplifiedRow<V extends View = View> = V extends View<infer Columns>
    ? Simplify<UnionToIntersection<ColumnRowData<Columns[number]>>>
    : never;

export function getViewRootFieldName(view: View): string {
    return view.source.type === 'function'
        ? view.source.functionName
        : view.source.collectionName;
}

export function getViewStaticArgs(view: View): Record<string, unknown> | undefined {
    return view.source.type === 'function' ? view.source.args : undefined;
}

export function getAllFilters(filterGroups: FilterGroups): FilterSchema[] {
    return filterGroups.flatMap(group => group.filters);
}


// JSON Schema types for view definitions
// These types represent the serializable structure for views that can be stored in JSON

export type { ColumnDefinitionJson, ViewJson } from './view-parser';
export { parseColumnDefinitionJson, parseViewJson } from './view-parser';

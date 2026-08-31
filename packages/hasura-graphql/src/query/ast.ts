// Query AST nodes.
//
// A `Query` describes what to select from a Hasura root field: scalars
// (`valueQuery`), nested objects (`objectQuery`) and related collections
// (`arrayQuery`, which additionally carries Hasura's `where` / `order_by` /
// `distinct_on` / `limit` arguments). `FieldQuery` adds GraphQL aliasing on top.
import type { HasuraFilterExpression } from '../hasura/filter-expression.js';
import type { OrderDirection } from '../order-direction.js';

export type OrderByConfig = {
    key: string; // data key to order by
    direction: OrderDirection;
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

// Helper to create a FieldAlias
export function fieldAlias<const Alias extends string, const FQ extends FieldQuery>(
    alias: Alias,
    fieldQuery: FQ,
): FieldAlias & { alias: Alias; field: FQ } {
    return { type: "fieldAlias", alias, field: fieldQuery };
}

/**
 * Creates a ValueQuery (scalar field) definition.
 */
export function valueQuery<const Field extends string, const Path extends string | undefined = undefined>(args: { field: Field; path?: Path }): ValueQuery & { field: Field } & WithOptionalPath<Path> {
    return {
        type: 'valueQuery',
        field: args.field,
        ...(args.path !== undefined ? { path: args.path } : {}),
    } as unknown as ValueQuery & { field: Field } & WithOptionalPath<Path>;
}

/**
 * Creates an ObjectQuery (nested object) with a selection set.
 * selectionSet must contain only Query variants (value/object/array queries).
 */
export function objectQuery<const Field extends string, const SelectionSet extends readonly Query[], const Path extends string | undefined = undefined>(args: {
    field: Field;
    selectionSet: SelectionSet;
    path?: Path;
}): ObjectQuery & { field: Field; selectionSet: SelectionSet } & WithOptionalPath<Path> {
    return {
        type: 'objectQuery',
        field: args.field,
        selectionSet: args.selectionSet,
        ...(args.path !== undefined ? { path: args.path } : {}),
    } as unknown as ObjectQuery & { field: Field; selectionSet: SelectionSet } & WithOptionalPath<Path>;
}

/**
 * Creates an ArrayQuery (list) with a selection set and optional ordering/limit.
 */
export function arrayQuery<const Field extends string, const SelectionSet extends readonly Query[], const Path extends string | undefined = undefined>(args: {
    field: Field;
    selectionSet: SelectionSet;
    path?: Path;
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraFilterExpression;
}): ArrayQuery & { field: Field; selectionSet: SelectionSet } & WithOptionalPath<Path>;

export function arrayQuery(args: {
    field: string;
    selectionSet: readonly Query[];
    path?: string;
    orderBy?: OrderByConfig | OrderByConfig[];
    distinctOn?: string[];
    limit?: number;
    where?: HasuraFilterExpression;
}): ArrayQuery {
    return {
        type: 'arrayQuery',
        field: args.field,
        selectionSet: args.selectionSet,
        ...(args.path !== undefined ? { path: args.path } : {}),
        ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
        ...(args.distinctOn !== undefined ? { distinctOn: args.distinctOn } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.where !== undefined ? { where: args.where } : {}),
    } as ArrayQuery;
}

export type WithOptionalPath<Path extends string | undefined> = Path extends string
    ? { path: Path }
    : { path?: undefined };

// ---------------------------------------------------------------------------
// Orderable field paths
//
// Only scalars reachable through plain object nesting can be ordered on:
// JSON `path` selections and collection (`arrayQuery`) members cannot.
// ---------------------------------------------------------------------------

export type ExtractTopLevelKey<FQ extends FieldQuery> = FQ extends {
    type: "fieldAlias";
    alias: infer Alias extends string;
}
    ? Alias
    : FQ extends { field: infer Field extends string }
    ? Field
    : never;

type FieldOfQuery<Q extends Query> = Q extends { field: infer Field } ? Field : never;
type SelectionSetOfQuery<Q extends Query> = Q extends { selectionSet: infer SelectionSet extends readonly Query[] }
    ? SelectionSet
    : never;

type PrefixPath<Prefix extends string, Path extends string> = `${Prefix}.${Path}`;

type OrderablePathFromQuery<Q extends Query> = Q extends { path: string }
    ? never
    : Q extends { type: "valueQuery" }
    ? FieldOfQuery<Q> & string
    : Q extends { type: "objectQuery" }
    ? PrefixPath<FieldOfQuery<Q> & string, OrderablePathFromSelectionSet<SelectionSetOfQuery<Q>>>
    : never;

type OrderablePathFromFieldQuery<FQ extends FieldQuery> = FQ extends FieldAlias
    ? OrderablePathFromFieldQuery<FQ["field"]>
    : FQ extends Query
    ? OrderablePathFromQuery<FQ>
    : never;

type OrderablePathFromSelectionSet<SelectionSet extends readonly Query[]> = SelectionSet[number] extends infer SelectionItem
    ? SelectionItem extends Query
    ? OrderablePathFromQuery<SelectionItem>
    : never
    : never;

export type OrderableFieldPath<FieldQueries extends readonly FieldQuery[]> = string extends ExtractTopLevelKey<FieldQueries[number]>
    ? string
    : FieldQueries[number] extends infer FieldQueryItem
    ? FieldQueryItem extends FieldQuery
    ? OrderablePathFromFieldQuery<FieldQueryItem>
    : never
    : never;

function collectOrderableFieldPathsFromQuery(query: Query, prefix: readonly string[] = []): string[] {
    if (query.path !== undefined) {
        return [];
    }

    const fieldPath = [...prefix, query.field];

    if (query.type === "valueQuery") {
        return [fieldPath.join(".")];
    }

    if (query.type === "objectQuery") {
        return query.selectionSet.flatMap(selection => collectOrderableFieldPathsFromQuery(selection, fieldPath));
    }

    return [];
}

function collectOrderableFieldPathsFromFieldQuery(fieldQuery: FieldQuery): string[] {
    if (fieldQuery.type === "fieldAlias") {
        return collectOrderableFieldPathsFromFieldQuery(fieldQuery.field);
    }

    return collectOrderableFieldPathsFromQuery(fieldQuery);
}

export function getOrderableFieldPaths(fieldQueries: readonly FieldQuery[]): string[] {
    return [...new Set(fieldQueries.flatMap(collectOrderableFieldPathsFromFieldQuery))];
}

export function orderByIsSelectedField(fieldQueries: readonly FieldQuery[], orderBy: string): boolean {
    return getOrderableFieldPaths(fieldQueries).includes(orderBy);
}

function getSingleFieldQueryOrderBy(fieldQuery: FieldQuery): string | undefined {
    if (fieldQuery.type === "fieldAlias") {
        return getSingleFieldQueryOrderBy(fieldQuery.field);
    }

    if (fieldQuery.type === "valueQuery" && fieldQuery.path === undefined) {
        return fieldQuery.field;
    }

    return undefined;
}

/**
 * The implicit orderBy for a set of field queries: a single unaliased scalar
 * selection is orderable on its own; anything else needs an explicit orderBy.
 */
export function getFieldQueriesOrderBy(fieldQueries: readonly FieldQuery[]): string | undefined {
    if (fieldQueries.length !== 1) {
        return undefined;
    }

    return getSingleFieldQueryOrderBy(fieldQueries[0]);
}

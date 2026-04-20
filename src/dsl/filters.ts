import type {
    FilterExpr,
    FilterField,
    FilterSchema,
    FilterGroup,
    FilterGroups,
    FilterTransform,
} from '../framework/filters';
import type { FilterControl } from '../framework/filters';

export type { FilterField, FilterSchema, FilterGroup, FilterGroups, FilterTransform };

type StringKeyOf<Row> = Extract<keyof Row, string>;
type MutableTuple<T extends readonly unknown[]> = [...T];
type UnwrapArray<T> = T extends readonly (infer E)[] ? E : T;
type NextPathTarget<T> = UnwrapArray<NonNullable<T>>;

type PrevDepth = {
    0: never;
    1: 0;
    2: 1;
    3: 2;
    4: 3;
    5: 4;
    6: 5;
    7: 6;
    8: 7;
    9: 8;
    10: 9;
};

type ShouldRecurse<T> =
    T extends object
        ? T extends (...args: never[]) => unknown
            ? false
            : T extends Date
                ? false
                : true
        : false;

/**
 * All valid dotted field paths for a given row type.
 *
 * Examples:
 * - "id"
 * - "customer.email"
 * - "lines.sku" (arrays are traversed via their element type)
 */
export type FilterFieldPath<Row, Depth extends keyof PrevDepth = 10> =
    // If Row is too wide (e.g. generic object), we can't enumerate paths.
    string extends keyof Row
        ? string
        : {
              [K in StringKeyOf<Row>]:
                  ShouldRecurse<NextPathTarget<Row[K]>> extends true
                      ? Depth extends 0
                          ? K
                          : K | `${K}.${FilterFieldPath<NextPathTarget<Row[K]>, PrevDepth[Depth]>}`
                      : K;
          }[StringKeyOf<Row>];

type PropValue<Row, Key extends string> =
    // If Row is too wide (e.g. generic object), we can't safely resolve path values.
    string extends keyof Row
        ? unknown
        : Key extends keyof Row
            ? Row[Key]
            : never;

/**
 * Resolve the (possibly nullable) value type at a dotted field path.
 *
 * Examples:
 * - PathValue<Row, "id"> => Row["id"]
 * - PathValue<Row, "customer.email"> => Row["customer"]["email"] (with nullables preserved)
 * - Arrays are traversed via their element type.
 */
export type PathValue<Row, Path extends string> =
    string extends keyof Row
        ? unknown
        : Path extends `${infer Head}.${infer Tail}`
            ? PathValue<NextPathTarget<PropValue<Row, Head>>, Tail>
            : PropValue<Row, Path>;

export type FilterFieldForRow<Row> =
    | FilterFieldPath<Row>
    | { and: FilterFieldPath<Row>[] }
    | { or: FilterFieldPath<Row>[] }
    // Used by FilterExpr.computedCondition(); doesn't map to row fields.
    | { or: [] };

export type FilterExprForRow<Row> =
    | ({ type: 'and'; filters: FilterExprForRow<Row>[] } & Omit<Extract<FilterExpr, { type: 'and' }>, 'filters'>)
    | ({ type: 'or'; filters: FilterExprForRow<Row>[] } & Omit<Extract<FilterExpr, { type: 'or' }>, 'filters'>)
    | ({ type: 'not'; filter: FilterExprForRow<Row> } & Omit<Extract<FilterExpr, { type: 'not' }>, 'filter'>)
    | (Omit<Extract<FilterExpr, { field: FilterField; value: FilterControl }>, 'field'> & {
          field: FilterFieldForRow<Row>;
      });

export const filterField = {
    and: <const Fields extends readonly string[]>(...fields: Fields): FilterField & { and: MutableTuple<Fields> } =>
        ({ and: fields as unknown as MutableTuple<Fields> } as FilterField & { and: MutableTuple<Fields> }),
    or: <const Fields extends readonly string[]>(...fields: Fields): FilterField & { or: MutableTuple<Fields> } =>
        ({ or: fields as unknown as MutableTuple<Fields> } as FilterField & { or: MutableTuple<Fields> }),
};

export function filterGroup(args: {
    name: string;
    label: string | null;
    filters: FilterSchema[];
}): FilterGroup {
    return {
        name: args.name,
        label: args.label,
        filters: args.filters,
    };
}

export function filter(args: {
    rowType?: never;
    id: string;
    label: string;
    expression: FilterExpr;
    aiGenerated?: boolean;
}): FilterSchema;
export function filter<Row, const Expr extends FilterExpr>(args: {
    rowType: Row;
    id: string;
    label: string;
    expression: Expr & FilterExprForRow<Row>;
    aiGenerated?: boolean;
}): FilterSchema;
export function filter(args: {
    rowType?: unknown;
    id: string;
    label: string;
    expression: FilterExpr;
    aiGenerated?: boolean;
}): FilterSchema {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowType, ...rest } = args;
    return {
        id: rest.id,
        label: rest.label,
        expression: rest.expression,
        aiGenerated: rest.aiGenerated ?? false,
    };
}

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

type MutableTuple<T extends readonly unknown[]> = [...T];

/**
 * All valid dotted field paths for a given row type, and the value type each
 * path resolves to. Both come from @kronor/hasura-graphql; the aliases keep
 * DTV's filter-oriented names.
 */
import type { FieldPath } from '@kronor/hasura-graphql';

export type { FieldPath as FilterFieldPath, PathValue } from '@kronor/hasura-graphql';

export type FilterFieldForRow<Row> =
    | FieldPath<Row>
    | { and: FieldPath<Row>[] }
    | { or: FieldPath<Row>[] }
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

import type {
    FilterExpr,
    FilterField,
    FilterFieldForRow,
    FilterSchema,
    FilterGroup,
    FilterGroups,
    FilterTransform,
} from '../framework/filters';
import type { FilterControl } from '../framework/filters';
import type { MutableTuple, ValidateFilterExprForRow } from './filterTyping';

export type { FilterField, FilterFieldForRow, FilterSchema, FilterGroup, FilterGroups, FilterTransform };

/**
 * All valid dotted field paths for a given row type, and the value type each
 * path resolves to. Both come from @kronor/hasura-graphql; the aliases keep
 * DTV's filter-oriented names.
 */
export type { FieldPath as FilterFieldPath, PathValue } from '@kronor/hasura-graphql';

/**
 * A filter expression whose leaves all name real paths on `Row`.
 *
 * `filter({ rowType })` checks more than this (the control and the operator
 * have to suit the field's type as well, see ./filterTyping); the type stays
 * exported for callers who want to constrain an expression by field alone.
 */
export type FilterExprForRow<Row> =
    | ({ type: 'and'; filters: FilterExprForRow<Row>[] } & Omit<Extract<FilterExpr, { type: 'and' }>, 'filters'>)
    | ({ type: 'or'; filters: FilterExprForRow<Row>[] } & Omit<Extract<FilterExpr, { type: 'or' }>, 'filters'>)
    | ({ type: 'not'; filter: FilterExprForRow<Row> } & Omit<Extract<FilterExpr, { type: 'not' }>, 'filter'>)
    | (Omit<Extract<FilterExpr, { field: FilterField; value: FilterControl }>, 'field'> & {
          field: FilterFieldForRow<Row>;
      });

export const filterField = {
    and: <const Fields extends readonly string[]>(...fields: Fields): { and: MutableTuple<Fields> } =>
        ({ and: [...fields] }),
    or: <const Fields extends readonly string[]>(...fields: Fields): { or: MutableTuple<Fields> } =>
        ({ or: [...fields] }),
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

/**
 * Checks `expression` against `Row`: every field path has to exist, and the
 * control and the operator of each leaf have to suit the type of the field
 * they filter — `FilterControl.text()` cannot filter a numeric column, `iLike`
 * is not available on one. See `ValidateFilterExprForRow` for the full set of
 * checks and the escape hatches.
 *
 * The checks need a `Row` that is already known. Inside a generic helper that
 * builds filters for a row type it hasn't been given yet, they cannot be
 * evaluated and are skipped; constrain the helper's own arguments with
 * `FilterFieldPath<Row>` so its callers are still checked:
 *
 *     function textFilter<Row, const Field extends FilterFieldPath<Row>>(
 *         args: { rowType: Row; id: string; label: string; field: Field }
 *     ) {
 *         return filter({
 *             rowType: args.rowType,
 *             id: args.id,
 *             label: args.label,
 *             expression: FilterExpr.equals({ field: args.field, control: FilterControl.text() })
 *         });
 *     }
 */
export function filter<Row, const Expr extends FilterExpr>(args: {
    rowType: Row;
    id: string;
    label: string;
    expression: Expr & ValidateFilterExprForRow<Row, Expr>;
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

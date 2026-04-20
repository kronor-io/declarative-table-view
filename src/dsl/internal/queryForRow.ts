import type {
    ArrayQuery,
    ArrayQueryForRow,
    ObjectQueryForRow,
    QueryForRowSafe,
    ValueQueryForRow,
} from '../../framework/column-definition';

import type { HasuraFilterExpression } from '../../framework/graphql';
import { hasuraDSLforRowType } from '../hasura';
import type { HasuraForRow } from '../hasura';

import { arrayQuery, objectQuery, valueQuery } from '../columns';

type NonNullish<T> = Exclude<T, null | undefined>;
type ElemOf<T> = T extends ReadonlyArray<infer E> ? E : never;

type ArrayFieldKey<Row> = ArrayQueryForRow<Row> extends { field: infer F }
    ? Extract<F, string>
    : never;

type ObjectFieldKey<Row> = ObjectQueryForRow<Row> extends { field: infer F }
    ? Extract<F, string>
    : never;

export type QueryBuilder<Row> = {
    value: <K extends keyof Row & string>(args: { field: K; path?: string }) => ValueQueryForRow<Row> & { field: K };

    object: <
        K extends ObjectFieldKey<Row> & keyof Row & string,
        const SelectionSet extends readonly QueryForRowSafe<NonNullish<Row[K]>>[]
    >(args: {
        field: K;
        selectionSet: (q: QueryBuilder<NonNullish<Row[K]>>) => SelectionSet;
        path?: string;
    }) => ObjectQueryForRow<Row> & { field: K; selectionSet: SelectionSet };

    array: <
        K extends ArrayFieldKey<Row> & keyof Row & string,
        const SelectionSet extends readonly QueryForRowSafe<NonNullish<ElemOf<NonNullish<Row[K]>>>>[]
    >(args: {
        field: K;
        selectionSet: (q: QueryBuilder<NonNullish<ElemOf<NonNullish<Row[K]>>>>) => SelectionSet;
        path?: string;
        orderBy?: ArrayQuery['orderBy'];
        distinctOn?: ArrayQuery['distinctOn'];
        limit?: number;
        where?: HasuraFilterExpression | ((h: HasuraForRow<NonNullish<ElemOf<NonNullish<Row[K]>>>>) => HasuraFilterExpression);
    }) => ArrayQueryForRow<Row> & { field: K; selectionSet: SelectionSet };

    selection: <SelectionRow>() => QueryBuilder<SelectionRow>;

    __row: Row;
};

/**
 * Internal typed query builder scoped to a Row type.
 *
 * Not exported via the public DSL surface (yet).
 */
export function queryForRow<Row>(): QueryBuilder<Row> {
    const value: QueryBuilder<Row>['value'] = args =>
        valueQuery({
            field: args.field,
            ...(args.path !== undefined ? { path: args.path } : {}),
        }) as unknown as ValueQueryForRow<Row> & { field: typeof args.field };

    const object: QueryBuilder<Row>['object'] = args => {
        const selectionSet = args.selectionSet(queryForRow<NonNullish<Row[typeof args.field]>>());
        return objectQuery({
            field: args.field,
            selectionSet,
            ...(args.path !== undefined ? { path: args.path } : {}),
        }) as unknown as ObjectQueryForRow<Row> & { field: typeof args.field; selectionSet: typeof selectionSet };
    };

    const array: QueryBuilder<Row>['array'] = args => {
        type Elem = NonNullish<ElemOf<NonNullish<Row[typeof args.field]>>>;
        const selectionSet = args.selectionSet(queryForRow<Elem>());

        const whereExpr = typeof args.where === 'function'
            ? args.where(hasuraDSLforRowType<Elem>())
            : args.where;

        return arrayQuery({
            field: args.field,
            selectionSet,
            ...(args.path !== undefined ? { path: args.path } : {}),
            ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
            ...(args.distinctOn !== undefined ? { distinctOn: args.distinctOn } : {}),
            ...(args.limit !== undefined ? { limit: args.limit } : {}),
            ...(whereExpr !== undefined ? { where: whereExpr } : {}),
        }) as unknown as ArrayQueryForRow<Row> & { field: typeof args.field; selectionSet: typeof selectionSet };
    };

    return {
        value,
        object,
        array,

        selection: <SelectionRow>() => queryForRow<SelectionRow>(),

        __row: null as unknown as Row,
    };
}

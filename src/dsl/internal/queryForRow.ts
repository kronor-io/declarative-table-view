import type {
    ArrayQuery,
    ArrayQueryForRow,
    ObjectQueryForRow,
    QueryForRowSafe,
    ValueQueryForRow,
} from '../../framework/column-definition';

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
    value: <K extends keyof Row & string>(field: K, args?: { path?: string }) => ValueQueryForRow<Row> & { field: K };

    object: <K extends ObjectFieldKey<Row> & keyof Row & string, const SelectionSet extends readonly QueryForRowSafe<NonNullish<Row[K]>>[]>(
        field: K,
        buildSelection: (q: QueryBuilder<NonNullish<Row[K]>>) => SelectionSet,
        args?: { path?: string }
    ) => ObjectQueryForRow<Row> & { field: K; selectionSet: SelectionSet };

    array: <K extends ArrayFieldKey<Row> & keyof Row & string, const SelectionSet extends readonly QueryForRowSafe<NonNullish<ElemOf<NonNullish<Row[K]>>>>[]>(
        field: K,
        buildSelection: (
            q: QueryBuilder<NonNullish<ElemOf<NonNullish<Row[K]>>>>
        ) => SelectionSet,
        args?: {
            path?: string;
            orderBy?: ArrayQuery['orderBy'];
            distinctOn?: ArrayQuery['distinctOn'];
            limit?: number;
            where?: ArrayQuery['where'];
        }
    ) => ArrayQueryForRow<Row> & { field: K; selectionSet: SelectionSet };

    selection: <SelectionRow>() => QueryBuilder<SelectionRow>;

    __row: Row;
};

/**
 * Internal typed query builder scoped to a Row type.
 *
 * Not exported via the public DSL surface (yet).
 */
export function queryForRow<Row>(): QueryBuilder<Row> {
    return {
        value: (field, args) =>
            valueQuery({
                field,
                ...(args?.path !== undefined ? { path: args.path } : {}),
            }) as unknown as ValueQueryForRow<Row> & { field: typeof field },

        object: (field, buildSelection, args) => {
            const selectionSet = buildSelection(queryForRow<NonNullish<Row[typeof field]>>());
            return objectQuery({
                field,
                selectionSet,
                ...(args?.path !== undefined ? { path: args.path } : {}),
            }) as unknown as ObjectQueryForRow<Row> & { field: typeof field; selectionSet: typeof selectionSet };
        },

        array: (field, buildSelection, args) => {
            type Elem = NonNullish<ElemOf<NonNullish<Row[typeof field]>>>;
            const selectionSet = buildSelection(queryForRow<Elem>());
            return arrayQuery({
                field,
                selectionSet,
                ...(args?.path !== undefined ? { path: args.path } : {}),
                ...(args?.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
                ...(args?.distinctOn !== undefined ? { distinctOn: args.distinctOn } : {}),
                ...(args?.limit !== undefined ? { limit: args.limit } : {}),
                ...(args?.where !== undefined ? { where: args.where } : {}),
            }) as unknown as ArrayQueryForRow<Row> & { field: typeof field; selectionSet: typeof selectionSet };
        },

        selection: <SelectionRow>() => queryForRow<SelectionRow>(),

        __row: null as unknown as Row,
    };
}

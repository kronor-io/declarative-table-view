// Builder for what to select from a Hasura aggregate.
//
// `Fields` is the type of the `aggregate` field of a `<collection>_aggregate`
// root field (`orders_aggregate_fields`, say): `count`, and one object per
// aggregate function (`sum`, `avg`, `min`, `max`, …) holding the columns it
// applies to. The builder is the row-scoped `QueryBuilder` over `Fields`, so
// anything Hasura offers can be selected with `value` / `object`, plus
// shorthands for the common functions. They build plain `valueQuery` /
// `objectQuery` nodes, so what they select is typed, rendered and merged like
// any other selection.
import type { ObjectQuery, ValueQuery } from '../query/ast.js';
import { objectQuery, valueQuery } from '../query/ast.js';
import { queryForRowType } from './query-builder.js';
import type { QueryBuilder } from './query-builder.js';

type NonNullish<T> = Exclude<T, null | undefined>;

/** The columns aggregate function `Fn` applies to, as `Fields` says. */
export type AggregateFunctionColumn<Fields, Fn extends string> =
    Fn extends keyof Fields ? Extract<keyof NonNullish<Fields[Fn]>, string> : never;

/** What an aggregate function shorthand selects: `Fn { ...columns }`. */
export type AggregateFunctionQuery<Fn extends string, Column extends string> = ObjectQuery & {
    field: Fn;
    selectionSet: readonly (ValueQuery & { field: Column })[];
};

type AggregateFunction<Fields, Fn extends string> = <const Column extends AggregateFunctionColumn<Fields, Fn>>(
    ...columns: [Column, ...Column[]]
) => AggregateFunctionQuery<Fn, Column>;

export type AggregateQueryBuilder<Fields> = QueryBuilder<Fields> & {
    /** `count`: how many rows there are. */
    count: () => ValueQuery & { field: 'count' };
    sum: AggregateFunction<Fields, 'sum'>;
    avg: AggregateFunction<Fields, 'avg'>;
    min: AggregateFunction<Fields, 'min'>;
    max: AggregateFunction<Fields, 'max'>;
};

function aggregateFunction(fn: string) {
    return (...columns: string[]) => {
        if (columns.length === 0) {
            throw new Error(`Aggregate function "${fn}" needs at least one column`);
        }
        return objectQuery({ field: fn, selectionSet: columns.map(column => valueQuery({ field: column })) });
    };
}

/**
 * Entry point for the aggregate builder. Pass the aggregate fields type (the
 * type of `<collection>_aggregate.aggregate`) either as an explicit type
 * argument or as a phantom value from `rowType()`:
 *
 *     const a = aggregateQueryForType(rowType<orders_aggregate_fields>());
 *     [a.count(), a.sum('amount', 'vat')]
 *     // count sum { amount vat }
 */
export function aggregateQueryForType<Fields>(): AggregateQueryBuilder<Fields>;
export function aggregateQueryForType<Fields>(_fieldsType: Fields): AggregateQueryBuilder<Fields>;
export function aggregateQueryForType<Fields>(_fieldsType?: Fields): AggregateQueryBuilder<Fields> {
    void _fieldsType;
    return {
        ...queryForRowType<Fields>(),
        count: () => valueQuery({ field: 'count' }),
        sum: aggregateFunction('sum'),
        avg: aggregateFunction('avg'),
        min: aggregateFunction('min'),
        max: aggregateFunction('max'),
    } as AggregateQueryBuilder<Fields>;
}

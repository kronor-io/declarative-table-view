// Aggregates of a view's rows.
//
// A view declares named aggregates (`View.aggregates`): what to select from its
// `<root>_aggregate` root field, over the rows the applied filters match, optionally
// narrowed by a `where` of the aggregate's own. DTV fetches all of them in one request
// of their own, which paging and sorting do not repeat, and hands each one's state to
// column footers and cells that declare it, to the pager and to the host.
import type { HasuraFilterExpression, Query } from '@kronor/hasura-graphql';
import { valuesEqual } from './equality';
import type { View } from './view';

export type AggregateName = string;

/**
 * One aggregate of a view. `selectionSet` is what is selected inside the aggregate root
 * field's `aggregate`. `Data` is what that selects, as the generated aggregate type says;
 * it is a type only, never set.
 */
export type AggregateDefinition<
    SelectionSet extends readonly Query[] = readonly Query[],
    Data extends object = Record<string, unknown>,
> = {
    type: 'aggregate';
    selectionSet: SelectionSet;
    /** Narrows the rows aggregated, besides the view's own conditions and the user's filters. */
    where?: HasuraFilterExpression;
    /** Type only, never set: what the aggregate's `data` is. */
    data?: Data;
};

export type AggregateDefinitions = Readonly<Record<AggregateName, AggregateDefinition>>;

/**
 * Where an aggregate is, for the rows on screen. It is `loading` while it is fetched for
 * other filters than the ones it was last fetched for, so a result never shows next to rows
 * it was not computed for; `error` when its request failed.
 */
export type AggregateState<Data extends object = Record<string, unknown>> =
    | { readonly state: 'loading' }
    | { readonly state: 'ready'; readonly data: Data }
    | { readonly state: 'error' };

/** What aggregate `A` selects. */
export type AggregateData<A> = A extends AggregateDefinition<readonly Query[], infer Data> ? Data : never;

/** The states of the aggregates `Aggregates`, by name. */
export type AggregateStates<Aggregates extends AggregateDefinitions = AggregateDefinitions> = {
    readonly [Name in keyof Aggregates]: AggregateState<AggregateData<Aggregates[Name]>>;
};

/** Aggregates are named with GraphQL names, since a name is the alias of its root field. */
export function isAggregateName(name: string): boolean {
    return /^[_A-Za-z][_0-9A-Za-z]*$/.test(name);
}

/** Whether an aggregate selects `count`, which the pager reads as the number of rows. */
export function selectsCount(aggregate: AggregateDefinition): boolean {
    return aggregate.selectionSet.some(query => query.type === 'valueQuery' && query.field === 'count' && query.path === undefined);
}

/**
 * Throws when `view`'s aggregates cannot be fetched or read as declared: a name that is not a
 * GraphQL name, a `totalCount` that names no aggregate selecting `count`, or a column that
 * reads an aggregate the view does not have under that name.
 */
export function assertValidAggregates(view: View): void {
    const aggregates: AggregateDefinitions = view.aggregates ?? {};
    for (const name of Object.keys(aggregates)) {
        if (!isAggregateName(name)) {
            throw new Error(`view("${view.id}") aggregates: "${name}" is not a valid name; use letters, digits and underscores, not starting with a digit`);
        }
    }

    if (view.totalCount !== undefined) {
        const counted = aggregates[view.totalCount];
        if (counted === undefined) {
            throw new Error(`view("${view.id}") totalCount: there is no aggregate "${view.totalCount}"`);
        }
        if (!selectsCount(counted)) {
            throw new Error(`view("${view.id}") totalCount: aggregate "${view.totalCount}" does not select count`);
        }
    }

    for (const column of view.columnDefinitions) {
        if (column.type !== 'tableColumn' || column.aggregates === undefined) continue;
        for (const [name, read] of Object.entries(column.aggregates)) {
            const declared = aggregates[name];
            if (declared === undefined) {
                throw new Error(`view("${view.id}") column "${column.id}" reads aggregate "${name}", which the view does not have`);
            }
            if (declared !== read && !valuesEqual(declared, read)) {
                throw new Error(`view("${view.id}") column "${column.id}" reads aggregate "${name}", but the view's aggregate of that name is another one`);
            }
        }
    }
}

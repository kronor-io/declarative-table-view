/**
 * DSL helper for declaring a view's aggregates.
 *
 * An aggregate is declared against the view's generated aggregate type
 * (`aggregateType`, the type of `<root>_aggregate.aggregate`): what it selects has
 * to exist there, and its readers see the result with Hasura's own types. A `where`
 * of its own is declared against the row type, as filters are.
 */
import {
    aggregateQueryForType,
    hasuraDSLforRowType,
    type AggregateQueryBuilder,
    type DataFromSelectionSetForRow,
    type HasuraFilterExpression,
    type HasuraForRow,
    type Query,
} from '@kronor/hasura-graphql';
import type { AggregateDefinition } from '../framework/aggregates';

export type { AggregateDefinition, AggregateState, AggregateStates, AggregateData } from '../framework/aggregates';
export type { AggregateQueryBuilder } from '@kronor/hasura-graphql';

/**
 * An aggregate of a view's rows, to put in the view's `aggregates` under a name, and in the
 * `aggregates` of the columns that read it:
 *
 *     const totals = DSL.aggregate({
 *         aggregateType: OrdersAggregateType,
 *         select: a => [a.count(), a.sum('amount', 'vat')],
 *     });
 *
 * `where` narrows the rows aggregated, besides the user's filters and the view's own
 * conditions. As a function, it is typed against `rowType`.
 */
export function aggregate<Fields, const SelectionSet extends readonly Query[], Row = unknown>(args: {
    // Phantom type-only fields used for inference
    aggregateType: Fields;
    rowType?: Row;
    where?: HasuraFilterExpression | ((h: HasuraForRow<Row>) => HasuraFilterExpression);
    select: (a: AggregateQueryBuilder<Fields>) => SelectionSet;
}): AggregateDefinition<SelectionSet, DataFromSelectionSetForRow<Fields, SelectionSet>> {
    const selectionSet = args.select(aggregateQueryForType<Fields>());
    const where = typeof args.where === 'function' ? args.where(hasuraDSLforRowType<Row>()) : args.where;
    return {
        type: 'aggregate',
        selectionSet,
        ...(where !== undefined ? { where } : {}),
    };
}

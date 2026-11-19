// Hasura aggregate root fields.
//
// Hasura answers `<collection>_aggregate(where: …) { aggregate { count sum { amount } } }`
// with the aggregate of the rows `where` matches. The selection inside `aggregate` is an
// ordinary selection set, built with `aggregateQueryForType` or the plain query builders.
import type { Query } from './ast.js';
import type { GraphQLArgument, GraphQLRootField } from './document.js';
import { buildSelectionSet } from './selection-set.js';

/** Hasura's default name of a collection's (or function's) aggregate root field. */
export function defaultAggregateFieldName(rootField: string): string {
    return `${rootField}_aggregate`;
}

/**
 * A root field selecting `selectionSet` inside its `aggregate`. Selections of the same
 * aggregate function are combined: `sum { amount }` and `sum { vat }` become
 * `sum { amount vat }`.
 */
export function aggregateRootField(args: {
    /** The aggregate root field, e.g. `orders_aggregate`. */
    field: string;
    alias?: string;
    args?: GraphQLArgument[];
    selectionSet: readonly Query[];
}): GraphQLRootField {
    return {
        field: args.field,
        ...(args.alias !== undefined ? { alias: args.alias } : {}),
        ...(args.args !== undefined && args.args.length > 0 ? { args: args.args } : {}),
        selectionSet: [{
            field: 'aggregate',
            selections: buildSelectionSet(args.selectionSet.map(fieldQuery => ({ fieldQuery })), { mergeNestedSelections: true }),
        }],
    };
}

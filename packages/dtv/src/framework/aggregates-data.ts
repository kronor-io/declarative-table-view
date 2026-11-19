// The request for a view's aggregates.
//
// One query holds every aggregate of the view, each an aliased aggregate root field over
// the rows the applied filters match (`$conditions`, the same variable the rows are read
// with), ANDed with the aggregate's own `where`. It takes no cursor, ordering or limit, so
// what it answers holds for every page.
import {
    aggregateRootField,
    graphqlVariableReference,
    hasuraFilterExpressionToObject,
    renderGraphQLQuery,
    toGraphQLArgumentValue,
    type GraphQLArgument,
    type GraphQLMultiRootQueryAST,
} from '@kronor/hasura-graphql';
import type { AggregateDefinition, AggregateName } from './aggregates';
import { buildConditionsExpression } from './data';
import { FetchError, toFetchError } from './fetch-error';
import type { GraphQLClient } from './graphql-client';
import type { FilterState } from './state';
import { getViewAggregateFieldName, getViewStaticArgs, type View } from './view';

/** What each aggregate selects, by name: the `aggregate` object of its root field. */
export type AggregatesResult = Readonly<Record<AggregateName, Record<string, unknown>>>;

function aggregateWhere(aggregate: AggregateDefinition) {
    const conditions = graphqlVariableReference('conditions');
    if (aggregate.where === undefined) return conditions;
    return { _and: [conditions, toGraphQLArgumentValue(hasuraFilterExpressionToObject(aggregate.where))] };
}

/** The query of `view`'s aggregates; `null` for a view without any. */
export function generateAggregatesQueryAST(view: View): GraphQLMultiRootQueryAST | null {
    const aggregates = Object.entries(view.aggregates ?? {});
    if (aggregates.length === 0) return null;

    const staticArgs = getViewStaticArgs(view);
    const field = getViewAggregateFieldName(view);

    return {
        operation: 'query',
        variables: [{ name: 'conditions', type: `${view.boolExpType}!` }],
        rootFields: aggregates.map(([name, aggregate]) => {
            const args: GraphQLArgument[] = [
                ...(staticArgs ? [{ name: 'args', value: toGraphQLArgumentValue(staticArgs) }] : []),
                { name: 'where', value: aggregateWhere(aggregate) },
            ];
            return aggregateRootField({ field, alias: name, args, selectionSet: aggregate.selectionSet });
        }),
    };
}

/** The query of `view`'s aggregates, rendered; `null` for a view without any. */
export function generateAggregatesQuery(view: View): string | null {
    const ast = generateAggregatesQueryAST(view);
    return ast === null ? null : renderGraphQLQuery(ast);
}

export function buildAggregatesQueryVariables(view: View, filterState: FilterState) {
    return { conditions: hasuraFilterExpressionToObject(buildConditionsExpression(view, filterState)) };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Fetches `view`'s aggregates over the rows `filterState` matches. Rejects like `fetchData`:
 * with a `FetchError` saying what kind of failure it was, or the signal's AbortError.
 */
export async function fetchAggregates({
    client,
    view,
    query,
    filterState,
    signal,
}: {
    client: GraphQLClient;
    view: View;
    /** `generateAggregatesQuery(view)` */
    query: string;
    filterState: FilterState;
    signal?: AbortSignal;
}): Promise<AggregatesResult> {
    let variables: ReturnType<typeof buildAggregatesQueryVariables>;
    try {
        variables = buildAggregatesQueryVariables(view, filterState);
    } catch (error) {
        signal?.throwIfAborted();
        throw new FetchError({ kind: 'internal', message: error instanceof Error ? error.message : String(error) }, { cause: error });
    }

    let response: unknown;
    try {
        response = await client.request(query, variables, { signal });
    } catch (error) {
        signal?.throwIfAborted();
        throw toFetchError(error);
    }
    signal?.throwIfAborted();

    const result: Record<AggregateName, Record<string, unknown>> = {};
    for (const name of Object.keys(view.aggregates ?? {})) {
        const field = isObject(response) ? response[name] : undefined;
        const aggregate = isObject(field) ? field.aggregate : undefined;
        if (!isObject(aggregate)) {
            throw new FetchError({ kind: 'unexpectedResponse', message: `The response has no aggregate at "${name}.aggregate"` }, { cause: response });
        }
        result[name] = aggregate;
    }
    return result;
}

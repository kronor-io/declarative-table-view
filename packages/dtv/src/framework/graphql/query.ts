// Builds the table view's GraphQL query from its column definitions.
//
// The GraphQL/Hasura AST, its renderer and the selection-set lowering live in
// @kronor/hasura-graphql; what is DTV-specific is the column -> field-query
// mapping and the cursor pagination contract (the `conditions` /
// `paginationCondition` / `rowLimit` / `orderBy` variables).
import { ColumnDefinition, FieldQuery } from '../column-definition';
import { failure, mapResult, success, type Result } from '../result';
import {
    buildSelectionSet,
    ensureSelectionPath,
    graphqlVariableReference,
    renderGraphQLQuery,
    toGraphQLArgumentValue,
} from '@kronor/hasura-graphql';
import type {
    GraphQLArgument,
    GraphQLQueryAST,
    GraphQLSelectionSet,
} from '@kronor/hasura-graphql';

function generateSelectionSetFromColumnsInternal(
    columns: ColumnDefinition[],
    additionalFieldQueries?: readonly FieldQuery[],
): GraphQLSelectionSet {
    const fieldQueries = [...columns.flatMap(column => column.data), ...(additionalFieldQueries ?? [])];
    return buildSelectionSet(fieldQueries.map(fieldQuery => ({ fieldQuery })));
}

export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns);
}

/**
 * Why a column-aliased query cannot be built: these columns have several
 * top-level queries, so none of them alone is the column's value. Which one is
 * the caller's to say; pass such a column with `data` narrowed to that query.
 */
export type ColumnAliasedQueryError = {
    kind: 'severalTopLevelQueries';
    columnIds: string[];
};

/** One selection per column, aliased with the column id. */
export function generateColumnAliasedSelectionSetFromColumns(
    columns: ColumnDefinition[],
): Result<ColumnAliasedQueryError, GraphQLSelectionSet> {
    const columnIds = columns.filter(column => column.data.length > 1).map(column => column.id);
    if (columnIds.length > 0) {
        return failure({ kind: 'severalTopLevelQueries', columnIds });
    }

    return success(buildSelectionSet(columns.flatMap(column => column.data.map(fieldQuery => ({
        fieldQuery,
        alias: column.id,
    })))));
}

function buildGraphQLQueryAST(
    rootField: string,
    selectionSet: GraphQLSelectionSet,
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
    staticArgs?: Record<string, unknown>,
): GraphQLQueryAST {
    const rootFieldArgs: GraphQLArgument[] = [
        ...(staticArgs ? [{ name: 'args', value: toGraphQLArgumentValue(staticArgs) }] : []),
        {
            name: 'where',
            value: toGraphQLArgumentValue({
                _and: [graphqlVariableReference('conditions'), graphqlVariableReference('paginationCondition')]
            })
        },
        { name: 'limit', value: toGraphQLArgumentValue(graphqlVariableReference('rowLimit')) },
        { name: 'orderBy', value: toGraphQLArgumentValue(graphqlVariableReference('orderBy')) }
    ];

    return {
        operation: 'query',
        variables: [
            { name: 'conditions', type: `${boolExpType}!` },
            { name: 'paginationCondition', type: `${boolExpType}!` },
            { name: 'rowLimit', type: 'Int' },
            { name: 'orderBy', type: orderByType }
        ],
        // Always compose the final where via an _and that combines user/static conditions with
        // the pagination condition. When there is no active cursor the paginationCondition
        // will simply be an empty object {} which Hasura will treat as a no-op in the boolean expression.
        rootField: {
            field: rootField,
            args: rootFieldArgs,
        },
        selectionSet: ensureSelectionPath(selectionSet, paginationKey)
    };
}

export function generateGraphQLQueryAST(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
    staticArgs?: Record<string, unknown>,
    additionalFieldQueries?: readonly FieldQuery[],
): GraphQLQueryAST {
    return buildGraphQLQueryAST(
        rootField,
        generateSelectionSetFromColumnsInternal(columns, additionalFieldQueries),
        boolExpType,
        orderByType,
        paginationKey,
        staticArgs,
    );
}

export function generateColumnAliasedGraphQLQueryAST(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
    staticArgs?: Record<string, unknown>,
): Result<ColumnAliasedQueryError, GraphQLQueryAST> {
    return mapResult(
        selectionSet => buildGraphQLQueryAST(rootField, selectionSet, boolExpType, orderByType, paginationKey, staticArgs),
        generateColumnAliasedSelectionSetFromColumns(columns),
    );
}

export function generateGraphQLQuery(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
    staticArgs?: Record<string, unknown>,
    additionalFieldQueries?: readonly FieldQuery[],
): string {
    const ast = generateGraphQLQueryAST(rootField, columns, boolExpType, orderByType, paginationKey, staticArgs, additionalFieldQueries);
    return renderGraphQLQuery(ast);
}

export function generateColumnAliasedGraphQLQuery(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
    staticArgs?: Record<string, unknown>,
): Result<ColumnAliasedQueryError, string> {
    return mapResult(
        renderGraphQLQuery,
        generateColumnAliasedGraphQLQueryAST(rootField, columns, boolExpType, orderByType, paginationKey, staticArgs),
    );
}

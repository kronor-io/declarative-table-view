// Builds the table view's GraphQL query from its column definitions.
//
// The GraphQL/Hasura AST, its renderer and the selection-set lowering live in
// @kronor/hasura-graphql; what is DTV-specific is the column -> field-query
// mapping and the cursor pagination contract (the `conditions` /
// `paginationCondition` / `rowLimit` / `orderBy` variables).
import { ColumnDefinition, FieldQuery } from '../column-definition';
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
    SelectionSetInput,
} from '@kronor/hasura-graphql';

type SelectionSetFromColumnsOptions = {
    getTopLevelAlias?: (column: ColumnDefinition) => string | undefined;
    additionalFieldQueries?: readonly FieldQuery[];
};

function generateSelectionSetFromColumnsInternal(
    columns: ColumnDefinition[],
    options?: SelectionSetFromColumnsOptions,
): GraphQLSelectionSet {
    // When aliasing at the top level, only the column's first field query can
    // carry the column id as its alias.
    const columnInputs: SelectionSetInput[] = columns.flatMap(column =>
        (options?.getTopLevelAlias ? column.data.slice(0, 1) : column.data).map(fieldQuery => ({
            fieldQuery,
            alias: options?.getTopLevelAlias?.(column),
        })),
    );

    const additionalInputs: SelectionSetInput[] = (options?.additionalFieldQueries ?? []).map(fieldQuery => ({
        fieldQuery,
    }));

    return buildSelectionSet([...columnInputs, ...additionalInputs]);
}

export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns);
}

function getColumnAliasedTopLevelAlias(column: ColumnDefinition): string {
    return column.id;
}

export function generateColumnAliasedSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns, {
        getTopLevelAlias: getColumnAliasedTopLevelAlias,
    });
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
        generateSelectionSetFromColumnsInternal(columns, { additionalFieldQueries }),
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
): GraphQLQueryAST {
    return buildGraphQLQueryAST(
        rootField,
        generateColumnAliasedSelectionSetFromColumns(columns),
        boolExpType,
        orderByType,
        paginationKey,
        staticArgs,
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
): string {
    const ast = generateColumnAliasedGraphQLQueryAST(rootField, columns, boolExpType, orderByType, paginationKey, staticArgs);
    return renderGraphQLQuery(ast);
}

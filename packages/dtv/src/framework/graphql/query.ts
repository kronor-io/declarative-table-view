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
    fieldQueryToSelectionSetItem,
    graphqlVariableReference,
    mergeSelectionSets,
    renderGraphQLQuery,
    toGraphQLArgumentValue,
} from '@kronor/hasura-graphql';
import type {
    GraphQLArgument,
    GraphQLQueryAST,
    GraphQLSelectionSet,
    GraphQLSelectionSetItem,
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

    const columnSelections = buildSelectionSet(columnInputs);

    // An additional field query is there so the response carries that path under its own
    // name; a column already selecting it that way covers it. Selections only merge when
    // they are identical, so without this a column aliased to its own field name (which is
    // what the column-aliased selection set produces for a column whose id is its field)
    // would leave the path selected twice, and the consumer would see it twice.
    const additionalSelections = (options?.additionalFieldQueries ?? [])
        .map(fieldQuery => fieldQueryToSelectionSetItem(fieldQuery))
        .filter(item => !isSelectedUnderOwnName(columnSelections, item));

    return mergeSelectionSets(columnSelections, additionalSelections);
}

// Whether the item's whole path is already selected with no renaming along it, so a
// consumer reading the response by field path finds it. A selection under a different
// alias does not count: the path would be missing from the response under its own name.
function isSelectedUnderOwnName(selectionSet: GraphQLSelectionSet, item: GraphQLSelectionSetItem): boolean {
    const selection = selectionSet.find(
        candidate => candidate.field === item.field && (candidate.alias ?? candidate.field) === item.field,
    );

    if (!selection) {
        return false;
    }

    return (item.selections ?? []).every(child => isSelectedUnderOwnName(selection.selections ?? [], child));
}

export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns);
}

function getColumnAliasedTopLevelAlias(column: ColumnDefinition): string {
    return column.id;
}

export function generateColumnAliasedSelectionSetFromColumns(
    columns: ColumnDefinition[],
    additionalFieldQueries?: readonly FieldQuery[],
): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns, {
        getTopLevelAlias: getColumnAliasedTopLevelAlias,
        additionalFieldQueries,
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
    additionalFieldQueries?: readonly FieldQuery[],
): GraphQLQueryAST {
    return buildGraphQLQueryAST(
        rootField,
        generateColumnAliasedSelectionSetFromColumns(columns, additionalFieldQueries),
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
    additionalFieldQueries?: readonly FieldQuery[],
): string {
    const ast = generateColumnAliasedGraphQLQueryAST(rootField, columns, boolExpType, orderByType, paginationKey, staticArgs, additionalFieldQueries);
    return renderGraphQLQuery(ast);
}

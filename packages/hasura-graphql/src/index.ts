// @kronor/hasura-graphql
//
// Typed GraphQL/Hasura AST primitives shared by declarative, schema-driven UIs.
//
//   hasura/  Hasura boolean expressions: build, normalize, compare, lower to
//            the `*_bool_exp` input shape.
//   query/   Query AST nodes, GraphQL document AST + renderer, and the
//            type-level derivation between selection sets and row shapes.
//   dsl/     Row-scoped builders that constrain paths and selections to a
//            known row type.

// --- shared type utilities -------------------------------------------------
export type { UnionToIntersection, Simplify, EmptyObject } from './typelevel.js';
export type { OrderDirection } from './order-direction.js';
export { isOrderDirection } from './order-direction.js';

// --- Hasura filter expressions ---------------------------------------------
export type {
    HasuraFilterObject,
    HasuraFilterObjectLogical,
    HasuraFilterObjectField,
    HasuraFilterObjectFieldValue,
    HasuraOperator,
    HasuraOperatorFor,
    HasuraComparable,
} from './hasura/filter-object.js';
export { hasuraOperatorsAreEqual } from './hasura/filter-object.js';

export type { HasuraFilterExpression } from './hasura/filter-expression.js';
export {
    Hasura,
    hasuraFilterExpressionToObject,
    hasuraFilterExpressionsAreEqual,
    normalizeHasuraFilterExpression,
    isEmptyFilterObject,
    unorderedArrayEqual,
} from './hasura/filter-expression.js';

// --- query AST -------------------------------------------------------------
export type {
    OrderByConfig,
    FieldAlias,
    ValueQuery,
    ObjectQuery,
    ArrayQuery,
    Query,
    FieldQuery,
    WithOptionalPath,
    ExtractTopLevelKey,
    OrderableFieldPath,
} from './query/ast.js';
export {
    fieldAlias,
    valueQuery,
    objectQuery,
    arrayQuery,
    getOrderableFieldPaths,
    orderByIsSelectedField,
    getFieldQueriesOrderBy,
} from './query/ast.js';

export type {
    DataFromQuery,
    DataFromFieldQuery,
    DataFromSelectionSet,
    DataFromFieldQueries,
    DataFromFieldQueriesSafe,
    DataFromQueryForRow,
    DataFromFieldQueryForRow,
    DataFromSelectionSetForRow,
    DataFromFieldQueriesForRow,
    DataFromFieldQueriesForRowSafe,
    ValueQueryForRow,
    ObjectQueryForRow,
    ArrayQueryForRow,
    QueryForRow,
    QueryForRowSafe,
    FieldAliasForRow,
    FieldQueryForRow,
    FieldQueryForRowSafe,
    ValidateFieldQueriesForRow,
} from './query/row-types.js';

// --- GraphQL document ------------------------------------------------------
export type {
    GraphQLVariable,
    GraphQLVariableReference,
    GraphQLArgument,
    GraphQLArgumentObject,
    GraphQLArgumentValue,
    GraphQLFieldNode,
    GraphQLSelectionSet,
    GraphQLSelectionSetItem,
    GraphQLQueryAST,
    HasuraOrderBy,
    HasuraOrderDirection,
} from './query/document.js';
export {
    renderGraphQLQuery,
    renderGraphQLLiteral,
    graphqlVariableReference,
    isGraphQLVariableReference,
    toGraphQLArgumentValue,
    ensureSelectionPath,
} from './query/document.js';

export type { SelectionSetInput } from './query/selection-set.js';
export {
    buildSelectionSet,
    mergeSelectionSets,
    queryToSelectionSetItem,
    fieldQueryToSelectionSetItem,
} from './query/selection-set.js';

// --- row-scoped DSL --------------------------------------------------------
export type { FieldPath, PathValue, PathDepth } from './dsl/path.js';
export type { HasuraForRow } from './dsl/hasura-dsl.js';
export { hasuraDSLforRowType } from './dsl/hasura-dsl.js';
export type { QueryBuilder } from './dsl/query-builder.js';
export { queryForRowType, rowType } from './dsl/query-builder.js';

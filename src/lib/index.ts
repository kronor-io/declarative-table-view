// Library entry point for consumers.
// Import global styles so they are embedded via the JS bundle (using vite-plugin-css-injected-by-js).
import '../index.css';

export { default as App } from '../App';
export type { AppProps, DTVAPI } from '../App';

// Re-export selected framework types that are useful to consumers.
export type { View } from '../framework/view';
export type { ViewJson, ColumnDefinitionJson } from '../framework/view';
export type { Runtime } from '../framework/runtime';
export type { ColumnDefinition } from '../framework/column-definition';
export type { FieldQuery } from '../framework/column-definition';
export type { FilterState } from '../framework/state';
export type { FilterSchema, FilterField, SuggestionFetcher, TransformConditionResult } from '../framework/filters';
export { TransformResult } from '../framework/filters';
export * as FilterValue from '../framework/filterValue';
export { FilterExpr } from '../dsl/filterExpr';
export { FilterControl } from '../dsl/filterControl';
export { CellRenderer } from '../dsl/cellRenderer';
export { FilterTransform } from '../dsl/filterTransform';
export { rowType } from '../dsl/columns';
export type { UserDataJson } from '../framework/user-data';
export type {
    UserDataLoadAPI,
    UserDataSaveAPI,
    UserDataLoadCallback,
    UserDataSaveCallback
} from '../framework/user-data-manager';
export type { ActionDefinition, ActionAPI } from '../framework/actions';
export type {
    HasuraFilterObject,
    HasuraOperator,
    HasuraOperatorFor,
    HasuraComparable,
    HasuraFilterExpression,
    GraphQLVariable,
    HasuraOrderBy,
    GraphQLSelectionSetItem,
    GraphQLSelectionSet,
    GraphQLQueryAST,
} from '../framework/graphql';
export {
    hasuraFilterExpressionToObject,
    hasuraFilterExpressionsAreEqual,
    buildHasuraConditions,
    hasuraOperatorsAreEqual,
    generateSelectionSetFromColumns,
    generateGraphQLQueryAST,
    generateGraphQLQuery,
    renderGraphQLQuery,
} from '../framework/graphql';
export { hasuraDSLforRowType } from '../dsl/hasura';
export type { HasuraForRow } from '../dsl/hasura';
export { buildGraphQLQueryVariables } from '../framework/data';

export type { Result, Failure, Success } from '../framework/result';
export { isFailure, isSuccess, failure, success } from '../framework/result';

export * as DSL from '../dsl';

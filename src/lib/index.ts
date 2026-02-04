// Library entry point for consumers.
// Import global styles so they are embedded via the JS bundle (using vite-plugin-css-injected-by-js).
import '../index.css';

export { default as App } from '../App';
export type { AppProps } from '../App';

// Re-export selected framework types that are useful to consumers.
export type { View } from '../framework/view';
export type { Runtime } from '../framework/runtime';
export type { ColumnDefinition } from '../framework/column-definition';
export type { FilterState } from '../framework/state';
export type { FilterSchema, FilterField, FilterTransform } from '../framework/filters';
export { FilterExpr } from '../dsl/filterExpr';
export { FilterControl } from '../dsl/filterControl';
export { CellRenderer } from '../dsl/cellRenderer';
export type { UserDataJson } from '../framework/user-data';
export type { RowSelectionAPI } from '../components/Table';
export type { ActionDefinition, ActionAPI } from '../framework/actions';
export { generateGraphQLQueryAST, renderGraphQLQuery } from '../framework/graphql';
export { buildGraphQLQueryVariables } from '../framework/data';

export type { Result, Failure, Success } from '../framework/result';
export { isFailure, isSuccess, failure, success } from '../framework/result';

export * as DSL from '../dsl';

// Library entry point for consumers.
// Import global styles so they are embedded via the JS bundle (using vite-plugin-css-injected-by-js).
import '../index.css';

export { default as App } from '../App';
export type { AppProps, DTVAPI } from '../App';

export type { AIIntegration, ModifyAiFilterPromptFn, RequestAiFilterFn } from '../components/aiAssistant';

// Re-export selected framework types that are useful to consumers.
export type { View, SimplifiedRow } from '../framework/view';
export { getViewRootFieldName, getViewStaticArgs } from '../framework/view';
export type { ViewJson, ColumnDefinitionJson } from '../framework/view';
export type { ViewProjection, FilterProjection, ColumnProjection, ControlProjection } from '../framework/view-projection';
export type { ViewMigration, ViewMigrationChain } from '../framework/view-migrations';
// Read events reported for older revisions of a definition in terms of its latest one.
export { currentDefinitionRevision, latestFilterId, migrateFilterState } from '../framework/view-migrations';
export type { UndecodedFilterState } from '../framework/user-data-undecoded';
// Used by `dtv definitions`, which loads them from the project's own copy of the package.
export { projectView, projectionsEqual } from '../framework/view-projection';
export { checkMigration } from '../framework/view-migrations';
export type {
    RowExpansionDefinition,
    RowExpansionRenderer,
    RowExpansionRendererProps,
    RowExpansionRuntimeEntry,
} from '../framework/view';
export type { Runtime } from '../framework/runtime';
export type { ColumnDefinition } from '../framework/column-definition';
export type { FieldQuery } from '../framework/column-definition';
export type { FilterState } from '../framework/state';
export type { CustomOperatorOption, FilterSchema, FilterField, FilterValueFormatter, FilterValueFormatContext, QueryTransformContext, SuggestionFetcher, TransformConditionResult } from '../framework/filters';
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
export type { ActionDefinition, ActionAPI, ActionUserDataAPI } from '../framework/actions';
export type {
    DTVAnalytics,
    DTVAnalyticsEvent,
    DTVAnalyticsEventBase,
    DTVAnalyticsEventPayload,
    DTVAnalyticsEventType,
    DTVAnalyticsSpan,
    DTVAnalyticsError,
    DTVAnalyticsPanel,
    DTVAnalyticsResets,
    DTVAnalyticsRetainedView,
    DTVAnalyticsUserDataError,
    FiltersAppliedTrigger,
    FetchReason
} from '../framework/analytics';
export type { FetchErrorInfo, FetchErrorKind } from '../framework/fetch-error';
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
export type { ColumnAliasedQueryError } from '../framework/graphql/query';
export type { DataOrdering } from '../framework/data-ordering';
export type { OrderDirection } from '../framework/order-direction';
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
export { filterExprForRowType } from '../dsl/filterExprForRow';
export type { FilterExprBuilderForRow } from '../dsl/filterExprForRow';
export { queryForRowType } from '../dsl/queryForRow';
export type { QueryBuilder } from '../dsl/queryForRow';
export type { Query, ValueQuery, ObjectQuery, ArrayQuery, FieldAlias, OrderByConfig } from '@kronor/hasura-graphql';
export { buildGraphQLQueryVariables } from '../framework/data';
export { hasuraCustomOperatorTransform, mapHasuraCustomOperatorInput } from '../framework/native-runtime';

export type { Failure, Success } from '../framework/result';
// `Result` is both the type and the namespace of its functions (`Result.mapResult(...)`).
export {
    Result,
    isFailure,
    isSuccess,
    failure,
    success,
    mapResult,
    mapFailure,
    bimap,
    flatMap,
    getOrElse,
    match,
    unwrapResult,
} from '../framework/result';

export * as DSL from '../dsl';

import React from "react";
import { ColumnDefinition } from "./column-definition";
import { FilterSchemasAndGroups } from "./filters";
import { FilterState } from "./state";
import { FilterFormState } from "./filter-form-state";
import { HasuraCondition, HasuraOrderBy } from "./graphql";

export type NoRowsComponentProps = {
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void;
    filterState: FilterState;
    applyFilters: () => void;
    updateFilterById: (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => void;
};

export type NoRowsComponent = (props: NoRowsComponentProps) => React.ReactNode;

export type ViewId = string;

export type View = {
    title: string;
    id: ViewId;
    collectionName: string;
    columnDefinitions: ColumnDefinition[];
    filterSchema: FilterSchemasAndGroups;
    /** Optional default prompt shown in the AI Filter Assistant for this view. */
    defaultAIFilterPrompt?: string;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    paginationKey: string; // Field to use for cursor-based pagination
    noRowsComponent?: NoRowsComponent;
    // Optional static GraphQL conditions (Hasura boolean expressions) always applied in addition to user filters
    staticConditions?: HasuraCondition[];
    // Optional static ordering entries always applied in addition to pagination ordering.
    // Each entry is a HasuraOrderBy object e.g. { createdAt: 'DESC' }
    // Pagination will still enforce a descending ordering on paginationKey if not provided here.
    staticOrdering?: HasuraOrderBy[];
};


// JSON Schema types for view definitions
// These types represent the serializable structure for views that can be stored in JSON

export type { ColumnDefinitionJson, ViewJson } from './view-parser';
export { parseColumnDefinitionJson, parseViewJson } from './view-parser';

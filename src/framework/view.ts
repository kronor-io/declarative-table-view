import type { ReactNode } from 'react';
import { ColumnDefinition } from "./column-definition";
import { FilterGroups, FilterSchema } from "./filters";
import { FilterState } from "./state";
import { FilterFormState } from "./filter-form-state";
import { HasuraFilterExpression, HasuraOrderBy } from "./graphql";

export type NoRowsComponentProps = {
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void;
    filterState: FilterState;
    applyFilters: () => void;
    updateFilterById: (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => void;
};

export type NoRowsComponent = (props: NoRowsComponentProps) => ReactNode;


export type ViewId = string;

export type View = {
    title: string;
    id: ViewId;
    collectionName: string;
    columnDefinitions: ColumnDefinition[];
    filterGroups: FilterGroups;
    /** Optional default prompt shown in the AI Filter Assistant for this view. */
    defaultAIFilterPrompt?: string;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    paginationKey: string; // Field to use for cursor-based pagination
    /**
     * Optional direction for cursor-based pagination ordering on paginationKey.
     * Defaults to 'DESC' for backwards compatibility.
     */
    paginationDirection?: 'ASC' | 'DESC';
    noRowsComponent?: NoRowsComponent;
    // Optional static GraphQL conditions (Hasura boolean expressions) always applied in addition to user filters
    staticConditions?: HasuraFilterExpression[];
    // Optional static ordering entries always applied in addition to pagination ordering.
    // Each entry is a HasuraOrderBy object e.g. { createdAt: 'DESC' }
    // Pagination will still enforce an ordering on paginationKey (defaults to 'DESC') even if not provided here.
    staticOrdering?: HasuraOrderBy[];
};

export function getAllFilters(filterGroups: FilterGroups): FilterSchema[] {
    return filterGroups.flatMap(group => group.filters);
}


// JSON Schema types for view definitions
// These types represent the serializable structure for views that can be stored in JSON

export type { ColumnDefinitionJson, ViewJson } from './view-parser';
export { parseColumnDefinitionJson, parseViewJson } from './view-parser';

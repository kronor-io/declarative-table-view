import React from "react";
import { ColumnDefinition } from "./column-definition";
import { FilterSchemasAndGroups } from "./filters";
import { FilterState } from "./state";
import { FilterFormState } from "./filter-form-state";

export type NoRowsComponentProps = {
    setFilterState: (updater: (currentState: FilterState) => FilterState) => void;
    filterState: FilterState;
    applyFilters: () => void;
    updateFilterById: (filterId: string, updater: (currentValue: FilterFormState) => FilterFormState) => void;
};

export type NoRowsComponent = (props: NoRowsComponentProps) => React.ReactNode;

export type View = {
    title: string;
    id: string;
    collectionName: string;
    columnDefinitions: ColumnDefinition[];
    filterSchema: FilterSchemasAndGroups;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    paginationKey: string; // Field to use for cursor-based pagination
    noRowsComponent?: NoRowsComponent;
};


// JSON Schema types for view definitions
// These types represent the serializable structure for views that can be stored in JSON

export type { ColumnDefinitionJson, ViewJson } from './view-parser';
export { parseColumnDefinitionJson, parseViewJson } from './view-parser';

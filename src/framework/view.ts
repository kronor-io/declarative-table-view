import React from "react";
import { ColumnDefinition } from "./column-definition";
import { FilterFieldSchema } from "./filters";
import { FilterFormState } from "../components/FilterForm";

export type NoRowsComponentProps = {
    setFilterState: (updater: (currentState: FilterFormState[]) => FilterFormState[]) => void;
    filterState: FilterFormState[];
    fetchData: () => void;
};

export type NoRowsComponent = (props: NoRowsComponentProps) => React.ReactNode;

export type View<CellRendererContext = unknown> = {
    title: string;
    routeName: string;
    collectionName: string;
    columnDefinitions: ColumnDefinition<CellRendererContext>[];
    filterSchema: FilterFieldSchema;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    paginationKey: string; // Field to use for cursor-based pagination
    noRowsComponent?: NoRowsComponent;
    customComponents?: Record<string, any>; // Legacy: Custom filter components resolved from runtime
    customFilterComponents?: Record<string, any>; // New: Custom filter components resolved from runtime
};


// JSON Schema types for view definitions
// These types represent the serializable structure for views that can be stored in JSON

export type { ColumnDefinitionJson, ViewJson } from './view-parser';
export { parseColumnDefinitionJson, parseViewJson } from './view-parser';

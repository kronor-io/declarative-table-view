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
    query: string;
    paginationKey: string; // Field to use for cursor-based pagination
    noRowsComponent?: NoRowsComponent;
};


// JSON Schema types for view definitions
// These types represent the serializable structure for views that can be stored in JSON

export type { ColumnDefinitionJson, ViewJson } from './view-parser';
export { parseColumnDefinitionJson } from './view-parser';

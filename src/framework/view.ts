import React from "react";
import { ColumnDefinition } from "./column-definition";
import { FilterFieldSchema } from "./filters";
import { FilterFormState } from "../components/FilterForm";

export type NoRowsComponentProps = {
    setFilterState: (state: FilterFormState[]) => void;
    filterState: FilterFormState[];
    fetchData: (customFilterState?: FilterFormState[]) => void;
};

export type NoRowsComponent = (props: NoRowsComponentProps) => React.ReactNode;

export type View<TData, TQueryResponse> = {
    title: string;
    routeName: string;
    collectionName: string;
    columnDefinitions: ColumnDefinition[];
    filterSchema: FilterFieldSchema;
    query: string;
    getResponseRows: (response: TQueryResponse) => TData[];
    QueryResponseType: TQueryResponse;
    paginationKey: string; // Field to use for cursor-based pagination
    noRowsComponent?: NoRowsComponent;
};

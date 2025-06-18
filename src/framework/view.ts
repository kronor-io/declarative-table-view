import { ColumnDefinition } from "./column-definition";
import { FilterFieldSchema } from "./filters";

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
};

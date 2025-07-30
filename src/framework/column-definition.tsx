import React from "react";
import { Center } from "../components/LayoutHelpers";
import { FilterFormState } from "../components/FilterForm";

export type CellRendererProps<TContext = unknown> = {
    data: Record<string, any>;
    context?: TContext; // Optional context passed from the table
    setFilterState: (updater: (currentState: FilterFormState[]) => FilterFormState[]) => void; // Function to update filter state
};

type CellRenderer<TContext = unknown> = (props: CellRendererProps<TContext>) => React.ReactNode;

export type OrderByConfig = {
    key: string; // data key to order by
    direction: 'ASC' | 'DESC';
};

// Tagged ADT for QueryConfig: either a path or a config group
export type Field = {
    type: 'field';
    path: string; // dot-separated data path
};

export type QueryConfig = {
    field: string
    orderBy?: OrderByConfig | OrderByConfig[];
    limit?: number;
}

export type QueryConfigs = {
    type: 'queryConfigs'
    configs: QueryConfig[]
};

export type FieldQuery = Field | QueryConfigs;

// Helper to create a Field
export function field(path: string): FieldQuery {
    return { type: 'field', path };
}

// Helper to create QueryConfigs
export function queryConfigs(configs: QueryConfig[]): FieldQuery {
    return { type: 'queryConfigs', configs };
}

export type ColumnDefinition<CellRendererContext = unknown> = {
    data: FieldQuery[];
    name: string; // column display name
    cellRenderer: CellRenderer<CellRendererContext>;
};

// Default function: returns the only value in the object
export const defaultCellRenderer: CellRenderer = ({ data }) => <Center>{Object.values(data)[0]}</Center>;

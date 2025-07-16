import React from "react";
import { Center } from "../components/LayoutHelpers";

export type CellRendererProps = {
    data: Record<string, any>;
};

type CellRenderer = (props: CellRendererProps) => React.ReactNode;

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

export type ColumnDefinition = {
    data: FieldQuery[];
    name: string; // column display name
    cellRenderer: CellRenderer;
};

// Default function: returns the only value in the object
export const defaultCellRenderer: CellRenderer = ({ data }) => <Center>{Object.values(data)[0]}</Center>;

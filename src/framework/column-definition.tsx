import React from "react";
import { Center } from "../components/LayoutHelpers";

export type CellRendererProps = {
    data: Record<string, any>;
};

type CellRenderer = (props: CellRendererProps) => React.ReactNode;

export type ColumnDefinition = {
    data: string[]; // array of dot-separated data paths
    name: string; // column display name
    cellRenderer: CellRenderer;
};

// Default function: returns the only value in the object
export const defaultCellRenderer: CellRenderer = ({ data }) => <Center>{Object.values(data)[0]}</Center>;

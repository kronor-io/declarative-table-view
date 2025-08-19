import React from "react";
import { CellRenderer } from "./column-definition";
import { NoRowsComponent } from "./view";

// Runtime type definition for individual view runtimes
export type Runtime = {
    cellRenderers: Record<string, CellRenderer | React.ComponentType<any>>;
    queryTransforms: Record<string, { fromQuery: (input: any) => any; toQuery: (input: any) => any; }>;
    noRowsComponents: Record<string, NoRowsComponent | React.ComponentType<any>>;
    customFilterComponents: Record<string, React.ComponentType<any>>;
};

import React from "react";
import { CellRenderer } from "./column-definition";
import { NoRowsComponent } from "./view";
import { TransformResult } from "./filters";

// Runtime type definition for individual view runtimes
export type Runtime = {
    cellRenderers: Record<string, CellRenderer | React.ComponentType<any>>;
    queryTransforms: Record<string, {
        toQuery: (input: any) => TransformResult;
    }>;
    noRowsComponents: Record<string, NoRowsComponent | React.ComponentType<any>>;
    customFilterComponents: Record<string, React.ComponentType<any>>;
    initialValues: Record<string, any>;
};

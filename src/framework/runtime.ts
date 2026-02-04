import React from "react";
import { CellRenderer } from "./column-definition";
import { NoRowsComponent } from "./view";
import { TransformResult, SuggestionFetcher } from "./filters";

// Use SuggestionFetcher alias from filters.ts; runtime suggestionFetchers return string arrays.

// Runtime type definition for individual view runtimes
export type Runtime = {
    cellRenderers: Record<string, CellRenderer>;
    queryTransforms: Record<string, {
        toQuery: (input: any) => TransformResult;
    }>;
    noRowsComponents: Record<string, NoRowsComponent>;
    customFilterComponents: Record<string, React.ComponentType<any>>;
    initialValues: Record<string, any>;
    // New runtime section for dynamic suggestion fetchers used by autocomplete filter controls
    suggestionFetchers: Record<string, SuggestionFetcher>;
};

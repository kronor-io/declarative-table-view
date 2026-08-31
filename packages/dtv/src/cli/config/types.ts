export type DtvTypegenConfig = {
    schema: {
        endpoint: string;
        headers?: Record<string, string>;
    };

    scan: {
        /** Glob patterns for TS/TSX files to scan for DSL.view calls. */
        include: string[];
        /** Glob patterns to ignore. */
        exclude?: string[];
        /** Package specifier to treat as the DTV import. */
        dtvImport?: string;
    };

    output: {
        /** Output file name pattern, written next to each view source file (required). */
        fileNamePattern: string;
    };

    /** Optional scalar overrides: GraphQL scalar name -> TS type expression (e.g. "DateTime": "string"). */
    scalars?: Record<string, string>;

    debug?: {
        /** Include original GraphQL type references as comments in generated output. */
        includeGraphqlTypeComments?: boolean;
    };
};

export type ViewInfo = {
    viewId: string;
    rootFieldName: string;
    sourceFile: string;
};

export type ScanDebugOptions = {
    enabled: boolean;
    focusFile?: string;
};

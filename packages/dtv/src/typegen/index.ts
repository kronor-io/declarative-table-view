// Public types for dtv typegen config.

export type DtvTypegenConfig = {
    schema: {
        endpoint: string;
        headers?: Record<string, string>;
    };

    scan: {
        include: string[];
        exclude?: string[];
        dtvImport?: string;
    };

    output: {
        /**
         * Output file name pattern written next to each view source file.
         *
         * Supported placeholders:
         * - `{viewId}`
         * - `{rootFieldName}`
         * - `{collectionName}`
         */
        fileNamePattern: string;
    };

    scalars?: Record<string, string>;

    /**
     * Emit row fields as `readonly` and lists as `ReadonlyArray` (default false), so code that
     * changes a row it got from the server does not compile. Same name and meaning as the
     * graphql-codegen option.
     */
    immutableTypes?: boolean;

    debug?: {
        /** Include original GraphQL type references as comments in generated output. */
        includeGraphqlTypeComments?: boolean;
    };
};

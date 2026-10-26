// Public types for dtv typegen config.

export type DtvSchemaConfig = {
    endpoint: string;
    headers?: Record<string, string>;
};

export type DtvTypegenConfig = {
    /**
     * The GraphQL schema typegen reads. A function is only called by `dtv typegen`, so that
     * other commands do not need what it needs (e.g. an admin secret from the environment).
     */
    schema: DtvSchemaConfig | (() => DtvSchemaConfig | Promise<DtvSchemaConfig>);

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

    /** `dtv definitions`: snapshots of view definitions and migrations of their user data. */
    definitions?: {
        /**
         * View factories `dtv definitions` cannot build with arguments made up from their parameter
         * types, by export name (or `path/to/module.ts#name` when several modules export the
         * name): the arguments to build them with, and the definition id when the id the
         * factory makes is computed from its arguments.
         */
        factories?: Record<string, { definition?: string; args?: unknown[] }>;
        /** Where migrations go for views whose module is not found (default `dtv-migrations`). */
        migrationsDir?: string;
        /** Vite config to load the views with (default: vite.config.* next to dtv.config.ts). */
        viteConfig?: string;
    };

    debug?: {
        /** Include original GraphQL type references as comments in generated output. */
        includeGraphqlTypeComments?: boolean;
    };
};

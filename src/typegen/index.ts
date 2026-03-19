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
         * - `{collectionName}`
         */
        fileNamePattern: string;
    };

    scalars?: Record<string, string>;
};

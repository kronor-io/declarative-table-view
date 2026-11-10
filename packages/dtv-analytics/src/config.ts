/*
 * A host's `dtv-analytics.config.ts`: where its analytics events and users' stored DTV data
 * are, and how to find its definitions.
 */

export type DtvAnalyticsConfig = {
    /** The sources to analyse, by name: the first is the default. */
    sources: Record<string, DtvAnalyticsSource>;
    definitions?: {
        /**
         * Glob patterns, from the config's folder, of the migration chains `dtv definitions`
         * writes (default `**\/dtv-migrations/*\/index.ts`).
         */
        include?: string[];
        exclude?: string[];
    };
};

/** A Hasura that serves the events and user data. */
export type DtvAnalyticsSource = {
    endpoint: string;
    /** Sent as `x-hasura-role`, when the source needs one chosen. */
    role?: string;
    /** Sent with every request. */
    headers?: Record<string, string>;
    /** Headers whose values are environment variables, by the variable's name: never written to a file. */
    secretHeaders?: Record<string, string>;
    /** Hasura's naming convention: it names arguments and the default field names (default `graphql-default`). */
    namingConvention?: 'graphql-default' | 'hasura-default';
    /** Rows a request (default 10,000). */
    pageSize?: number;
    /**
     * The events: DTV's envelope (`instanceId`, `sessionId`, `seq`, `occurredAt` for `at`,
     * `viewId`, `definition`, `definitionRevision`, `eventType` for `type`), the event's own
     * fields in `payload`, and `id`, `userId` and `createdAt`, when the source stored it.
     * `impersonatorId`, `route`, `appVersion` and `linkSource` are read when there.
     */
    events: DtvAnalyticsCollection;
    /** Users' stored data: `userId` and `data`; `revision` and `updatedAt` when there. */
    userData: DtvAnalyticsCollection;
    /** Where users' names are, when the source has them. */
    users?: { root: string; id?: string; name?: string };
};

export type DtvAnalyticsCollection = {
    /** The root field. */
    root: string;
    /**
     * The source's names for the fields read, where they differ from what the naming
     * convention makes of the names above; `null` for an optional field the source does not have.
     */
    fields?: Record<string, string | null>;
};

export function defineConfig(config: DtvAnalyticsConfig): DtvAnalyticsConfig {
    return config;
}

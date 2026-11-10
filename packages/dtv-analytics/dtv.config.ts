import type { DtvTypegenConfig } from '@kronor/dtv/typegen';

// `dtv typegen` for the app's own views, against the store's Hasura of a running source
// (`dtv-analytics up` serves it on port 4311 by default).
const config: DtvTypegenConfig = {
    schema: { endpoint: process.env.DTV_ANALYTICS_STORE_GRAPHQL ?? 'http://localhost:4311/v1/graphql' },
    scan: {
        include: ['app/src/**/*.{ts,tsx}'],
        dtvImport: '@kronor/dtv',
    },
    output: {
        fileNamePattern: 'dtv.generated-types.{viewId}.ts',
    },
    scalars: {
        jsonb: 'unknown',
        bigint: 'string',
        float8: 'number',
        timestamptz: 'string',
    },
    immutableTypes: true,
};

export default config;

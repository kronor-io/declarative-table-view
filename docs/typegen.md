# DTV Type Generation (CLI)

DTV ships with a CLI command for generating TypeScript types from a Hasura GraphQL schema.

## Install / Run

When `@kronor/dtv` is installed, it exposes a `dtv` executable:

- `dtv typegen -c dtv.config.ts`

(You can also run via `npx dtv typegen ...` depending on how you install it.)

To scaffold a config file:

- `dtv init`

## Configuration

The CLI loads a TypeScript config file (recommended) by transpiling it to ESM and importing it.

Minimal `dtv.config.ts`:

```ts
import type { DtvTypegenConfig } from '@kronor/dtv/typegen';

const config: DtvTypegenConfig = {
    schema: {
        endpoint: 'https://my-hasura.example.com/v1/graphql',
        headers: {
            // Example:
            // Authorization: `Bearer ${process.env.HASURA_TOKEN}`,
            // 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET ?? '',
        }
    },

    scan: {
        // Scan TS/TSX files for `DSL.view({ ... })` calls (supports aliased/namespaced imports too)
        include: [
            'src/**/*.{ts,tsx}'
        ],
        exclude: [
            '**/*.test.*',
            '**/node_modules/**'
        ],

        // Optional override if you re-export DTV under a different specifier.
        // dtvImport: '@kronor/dtv'
    },

    output: {
        // File name written next to each view module that calls DSL.view(...)
        // Supported placeholders: {viewId}, {collectionName}
        fileNamePattern: 'dtv.generated.{viewId}.ts'
    },

    // Optional scalar overrides: GraphQL scalar name -> TS type
    scalars: {
        // DateTime: 'string'
        // json: 'unknown'
        // jsonb: 'unknown'
    },

    debug: {
        // When true, include original GraphQL type refs as comments
        includeGraphqlTypeComments: false
    }
};

export default config;
```

## Output

For each discovered `DSL.view({ id, collectionName, ... })` call, the generator writes one file next to the view source file, named by `output.fileNamePattern`.

That file contains:

- TypeScript types for GraphQL output types reachable from the view’s `collectionName` row type (not exported)
- One exported alias:
    - `<ViewIdPascal>Row` – the inferred row type for that view’s `collectionName`

## Current limitations (v1)

- Only TS-authored views are considered. The scanner looks specifically for `DSL.view({ ... })` calls.
- `id` and `collectionName` must be string literals in the call argument.
- JSON views are not part of this flow yet.

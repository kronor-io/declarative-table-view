# DTV Type Generation (CLI)

DTV ships with a CLI command for generating TypeScript types from a Hasura GraphQL schema.

## Install / Run

When `@kronor/dtv` is installed, it exposes a `dtv` executable:

- `dtv typegen -c dtv.config.ts`

To generate types for a single view only:

- `dtv typegen <view-id> -c dtv.config.ts`

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
- Two exported members:
    - `<ViewIdPascal>Row` – the inferred row type for that view’s `collectionName`
    - `<ViewIdPascal>RowType` – a phantom value of that type, produced by `DSL.rowType<…>()`, which
      the DSL helpers take as `rowType`

The generator also edits the view module itself, as a convenience: it imports
`<ViewIdPascal>RowType` and adds `rowType:` to the `DSL.column(...)` and
`DSL.filter(...)` calls written inline in the `DSL.view({ ... })` argument that
do not have one yet. Calls that already pass `rowType` are left alone, so
re-running the generator is safe.

Passing `rowType` is what turns on checking of a view's columns and filters
against its row — see [api/row-typed-views.md](api/row-typed-views.md). A view
where no call ends up with a `rowType` gets no generated file.

## What the run reports

A view that produces no types leaves whatever generated file is already
committed next to it, so the row type it describes silently goes stale while
the code that imports it keeps type-checking against the old shape. Every way
that can happen is reported:

- **A view the scanner could not read** — its `id`, or its `source.collectionName`
  / `source.functionName`, is not a string literal — is named on stderr with
  which part was unreadable. A dynamic id such as
  `` id: subsidiaryId ? `${viewId}-${subsidiaryId}` : viewId `` is the usual
  cause; the generator has no way to know what the id will be at run time.
- **A view whose types could not be written** fails the command, naming the view
  and the error. The run finishes the other views first, so one broken view
  reports the rest rather than hiding them.
- **A generated module that was removed**, because nothing in its view passes
  `rowType:` any more, is named on stderr.

The closing line counts what was written against what was found — `Generated
types for 61 of 62 view(s).` — so a view that dropped out is visible without
reading the warnings.

## Current limitations (v1)

- Only TS-authored views are considered. The scanner looks specifically for `DSL.view({ ... })` calls.
- `id` and `collectionName` must be string literals in the call argument.
- JSON views are not part of this flow yet.

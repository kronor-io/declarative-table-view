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
        fileNamePattern: 'dtv.generated.{viewId}.ts',

        // Directory (relative to the working directory) every GraphQL type the views reach is
        // written into once, one module per type; the files next to the views import from it.
        typesDir: 'src/generated/dtv-types'
    },

    // Optional scalar overrides: GraphQL scalar name -> TS type
    scalars: {
        // DateTime: 'string'
        // json: 'unknown'
        // jsonb: 'unknown'
    },

    // Optional: emit row fields as `readonly` and lists as `ReadonlyArray` (default false),
    // so code that changes a row it got from the server does not compile.
    // immutableTypes: true,

    debug: {
        // When true, include original GraphQL type refs as comments
        includeGraphqlTypeComments: false
    }
};

export default config;
```

`schema` may also be a function returning the same object (or a promise of it). Only `dtv typegen`
calls it, so other commands reading `dtv.config.ts` (`dtv definitions`) do not need what it needs, e.g. a
secret from the environment:

```ts
schema: () => {
    const secret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
    if (!secret) throw new Error('HASURA_GRAPHQL_ADMIN_SECRET is required for type generation.');
    return { endpoint: 'https://my-hasura.example.com/v1/graphql', headers: { 'x-hasura-admin-secret': secret } };
},
```

## Output

The generator writes two kinds of modules.

**One module per type, in `output.typesDir`.** Every GraphQL output type a view's row reaches is
written once, into `<typesDir>/<TypeName>.ts`, and imports the types it refers to:

```ts
// <typesDir>/Order.ts
import type { Customer } from './Customer';
import type { Line } from './Line';

export type Order = {
    readonly id: string;
    readonly customer: Customer;
    readonly lines: ReadonlyArray<Line>;
};
```

A type reached by many views (a currency, a subsidiary, a user) is therefore declared once, and a
change to it in the schema changes one module.

**One module per view, next to it**, named by `output.fileNamePattern`. It imports its row type
from the types directory and exports:

- `<ViewIdPascal>Row` – the row type for that view's `collectionName` or `functionName`
- `<ViewIdPascal>RowType` – a phantom value of that type, produced by `DSL.rowType<…>()`, which
  the DSL helpers take as `rowType`
- For a view with `aggregates`, also `<ViewIdPascal>Aggregate` – the type of its
  `<root>_aggregate.aggregate` field – and `<ViewIdPascal>AggregateType`, which `DSL.aggregate`
  takes as `aggregateType` (see [aggregates.md](aggregates.md))

```ts
import { DSL as DTV } from '@kronor/dtv';
import type { Order } from '../../generated/dtv-types/Order';

export type OrdersRow = Order;
export const OrdersRowType = DTV.rowType<OrdersRow>();
```

The types directory holds what all views reach, also when `dtv typegen <view-id>` generates a
single view: every run writes the types of every view it finds (with the aggregate types of views
that have `aggregates`), and removes the modules it wrote that no view reaches any more. Files in
the directory that the generator did not write are left alone, and a module whose content did not
change is not rewritten. Types are read with the same schema and options for every view, so one
directory serves them all. Two type names that differ only in case fail the run, since they would
be one file on a case-insensitive file system.

### Upgrading from per-view copies

Before `typesDir`, each view module declared its own copy of every type its row reaches. Set
`output.typesDir` and run `dtv typegen` once: the view modules are rewritten to import from the
directory, with the same types. A view whose id or source the scanner cannot read keeps the module
committed next to it, which still declares its own copies and keeps compiling.

The generator also edits the view module itself, as a convenience: it imports
`<ViewIdPascal>RowType` and adds `rowType:` to the `DSL.column(...)`,
`DSL.virtualColumn(...)`, `DSL.fieldColumn(...)`, `DSL.rowExpansion(...)` and `DSL.filter(...)` calls
written inline in the `DSL.view({ ... })` argument that do not have one yet. Calls that already pass `rowType` are left alone, so
re-running the generator is safe.

Passing `rowType` is what turns on checking of a view's columns and filters
against its row, and all of these helpers require it — see
[api/row-typed-views.md](api/row-typed-views.md). A view where no call ends up
with a `rowType` gets no generated file.

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

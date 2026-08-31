# declarative-table-view

npm workspaces monorepo for Kronor's declarative, GraphQL-driven UI packages.

| Package | Description |
| --- | --- |
| [`@kronor/hasura-graphql`](packages/hasura-graphql) | Typed GraphQL and Hasura AST primitives: filter expressions, query documents, row-typed DSLs, schema type generation. No UI dependencies. |
| [`@kronor/dtv`](packages/dtv) | Schema-driven, declarative table views with advanced filtering, data fetching and AI-assisted filter generation. Built on `@kronor/hasura-graphql`. |

`@kronor/hasura-graphql` exists so the query/filter layer can be shared with
other declarative, GraphQL-driven UIs — for example a forms package — without
pulling in the table runtime.

## Getting started

```sh
npm install          # installs and links every workspace
npm run build        # builds both packages
npm run test-unit:all
npm run lint
```

Per-package commands take a workspace selector:

```sh
npm run build     --workspace @kronor/hasura-graphql
npm run test-unit --workspace @kronor/dtv
npm run dev                                  # DTV dev server
npm test                                     # DTV Playwright e2e
```

## Releasing

Each package is released and versioned independently from the repo root:

```sh
npm run release -- --package=hasura-graphql   # tags hasura-graphql-v<version>
npm run release -- --package=dtv              # tags v<version>, the default
```

The script lints, builds and tests the whole workspace, then bumps, tags,
pushes and publishes the selected package. Because `@kronor/dtv` depends on
`@kronor/hasura-graphql`, a dtv release refuses to proceed unless its declared
dependency range already resolves to a published version — so release the core
package first whenever you have changed it.

Use `--dry` to run the validations without publishing. See
[`scripts/release.mjs`](scripts/release.mjs) for all flags.

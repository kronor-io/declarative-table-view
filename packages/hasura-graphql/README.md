# @kronor/hasura-graphql

Typed GraphQL and Hasura AST primitives for declarative, schema-driven UIs.

This package holds the parts of [`@kronor/dtv`](../dtv) that are not about
tables: building and comparing Hasura boolean expressions, describing what to
select from a Hasura root field, rendering that to a GraphQL query string, and
the type-level machinery that ties both to a generated row type.

It has no UI dependencies — `graphql` is its only runtime dependency.

## Install

```sh
npm install @kronor/hasura-graphql
```

## What's in it

### `hasura/` — boolean expressions

`HasuraFilterExpression` is an algebra you can build, normalize and compare
before lowering it to the nested `*_bool_exp` shape Hasura expects.

```ts
import { Hasura, hasuraFilterExpressionToObject } from '@kronor/hasura-graphql';

const expr = Hasura.and(
    Hasura.condition('status', Hasura.eq('PAID')),
    Hasura.scope('customer', Hasura.condition('email', Hasura.ilike('%@example.com')))
);

hasuraFilterExpressionToObject(expr);
// { _and: [ { status: { _eq: 'PAID' } }, { customer: { email: { _ilike: '%@example.com' } } } ] }
```

Empty branches are dropped and single-member `_and` / `_or` nodes collapse, so
conditionally-built expressions stay clean without special-casing at the call
site. `hasuraFilterExpressionsAreEqual` compares two expressions structurally,
ignoring member order and scope/path spelling.

### `query/` — selection sets and documents

`Query` nodes describe a selection: `valueQuery` (scalar), `objectQuery`
(nested object) and `arrayQuery` (related collection, which also carries
`where` / `orderBy` / `distinctOn` / `limit`). `fieldAlias` adds GraphQL
aliasing.

```ts
import {
    valueQuery, objectQuery, arrayQuery,
    buildSelectionSet, renderGraphQLQuery, Hasura
} from '@kronor/hasura-graphql';

const selectionSet = buildSelectionSet([
    { fieldQuery: valueQuery({ field: 'id' }) },
    { fieldQuery: objectQuery({ field: 'customer', selectionSet: [valueQuery({ field: 'email' })] }) },
    { fieldQuery: arrayQuery({
        field: 'lines',
        selectionSet: [valueQuery({ field: 'sku' })],
        where: Hasura.condition('qty', Hasura.gt(0)),
        limit: 10
    }) }
]);

renderGraphQLQuery({
    operation: 'query',
    variables: [{ name: 'conditions', type: 'order_bool_exp!' }],
    rootField: { field: 'orders', args: [{ name: 'where', value: { type: 'variable', name: 'conditions' } }] },
    selectionSet
});
```

`buildSelectionSet` de-duplicates structurally identical selections, so several
independent consumers of the same row can contribute overlapping selections
without emitting duplicate fields. `ensureSelectionPath` guarantees a field is
selected when the caller needs it for its own bookkeeping (a pagination cursor,
a record id).

### `dsl/` — row-typed builders

Given a row type — typically generated from your schema — the builders
constrain field paths and selection sets to what actually exists.

```ts
import { queryForRowType, hasuraDSLforRowType, rowType } from '@kronor/hasura-graphql';

type Order = {
    id: string;
    status: string;
    customer: { email: string | null } | null;
    lines: Array<{ sku: string; qty: number | null }>;
};

const q = queryForRowType(rowType<Order>());

q.value({ field: 'id' });
q.object({ field: 'customer', selectionSet: c => [c.value({ field: 'email' })] });
q.array({
    field: 'lines',
    selectionSet: l => [l.value({ field: 'sku' })],
    // `h` is scoped to the line element type
    where: h => h.condition('qty', h.gt(0))
});

const h = hasuraDSLforRowType<Order>();
h.condition('customer.email', h.ilike('%@example.com')); // checked against Order
```

`FieldPath<Row>` and `PathValue<Row, Path>` are available directly if you need
to build your own row-typed APIs on top.

### `typegen` — schema to TypeScript

The `@kronor/hasura-graphql/typegen` entry point holds the schema-side half of
type generation: introspecting an endpoint and rendering GraphQL types as
TypeScript. Deciding *which* types to generate is left to the caller, since
that depends on how your project declares its views or forms.

```ts
import { fetchSchema, collectReachableTypes, renderTsFromSchema, unwrapCollectionElementType }
    from '@kronor/hasura-graphql/typegen';

const schema = await fetchSchema({ endpoint, headers });
const rowType = unwrapCollectionElementType(schema.getQueryType()!.getFields()['orders'].type);
const ts = renderTsFromSchema(collectReachableTypes(schema, [rowType]), { scalars: { uuid: 'string' } });
```

## Development

This package lives in the [declarative-table-view](https://github.com/kronor-io/declarative-table-view)
monorepo.

```sh
npm install            # from the repo root
npm run build   --workspace @kronor/hasura-graphql
npm run test-unit --workspace @kronor/hasura-graphql
```

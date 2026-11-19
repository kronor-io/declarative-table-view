# Plan: Hasura aggregates

A view declares named Hasura aggregates over its filtered rows. DTV fetches them alongside
the rows and hands the results to column footers, cell renderers, the pager and the host.

## Why

Finance shows totals in column footers on 13 DTV tables. To get them it wraps
`window.fetch`, reads DTV's `conditions` variable out of each request body
(`useDtvQueryConditions`), runs its own `<root>_aggregate` query, and puts the sums into the
footers through a React context (`DtvFooterCellsProvider`). DTV should own that query.

## Decisions

- **Aggregates belong to the view, not to a column.** `view.aggregates` is a record of named
  aggregates. Footers, cells, the pager and the host all read the same results.
- **Named.** One request holds every aggregate as an aliased `<root>_aggregate` root field.
  An aggregate may narrow the rows with its own `where`, ANDed with the user's conditions.
- **A request of its own.** Aggregates depend on the view, its view query (source, args,
  static conditions) and the applied filters. They do not depend on the cursor, the
  ordering or rows per page, so paging and sorting reuse them. Refresh refetches them.
- **Readers get a state.** `{ state: 'loading' } | { state: 'ready'; data } | { state: 'error' }`.
  Results for other filters never show next to the rows on screen. If the aggregate request
  fails, the table still works.
- **Columns declare what they read.** A column passes the aggregate definitions it uses
  (`aggregates: { totals }`), which types its `footerRenderer` and `cellRenderer`. It gets
  only those at runtime. `DSL.view` checks that each one is the view's aggregate of that name.
- **`footerRenderer` replaces `footer` (DTV 14).** `footer` was PrimeReact's
  `ColumnProps['footer']`, passed through unchanged. A function `footer` already got
  PrimeReact's options, so it could not take DTV's props as well. `footerRenderer` covers
  every footer, a static one included (`() => 'Total'`), so `footer` and the runtime's
  `columnFooters` are removed. A JSON view with `footer` fails to parse, with an error naming
  `footerRenderer`.
- **Types come from the schema.** Typegen emits `<View>Aggregate` (the
  `<root>_aggregate.aggregate` type, e.g. `orders_aggregate_fields`) and the
  `<View>AggregateType` phantom value, for views that declare `aggregates`. Deriving them
  from the row type would get the types wrong: `sum` of an `int` column is a `bigint`,
  `avg` is a `Float`.
- **The aggregate root field** is `<root>_aggregate`, which is Hasura's default naming.
  `source.aggregateName` overrides it when the schema renames it.

## Authoring

```ts
const totals = DSL.aggregate({
    rowType: OrdersRowType,                   // types `where`; optional
    aggregateType: OrdersAggregateType,       // generated
    select: a => [a.count(), a.sum('amount', 'vat')],
});
const overdue = DSL.aggregate({
    rowType: OrdersRowType,
    aggregateType: OrdersAggregateType,
    where: h => h.condition('dueDate', h.lt(today)),
    select: a => [a.sum('amount')],
});

DSL.view({
    ...,
    aggregates: { totals, overdue },
    totalCount: 'totals',                     // the pager shows "1–50 of 1,234"
    columnDefinitions: [
        DSL.column({
            rowType: OrdersRowType,
            aggregates: { totals },
            id: 'amount', name: 'Amount',
            data: [q.value({ field: 'amount' })],
            cellRenderer: ({ data, aggregates }) => …,
            footerRenderer: ({ aggregates }) =>
                aggregates.totals.state === 'ready' ? format(aggregates.totals.data.sum?.amount) : null,
        }),
    ],
});
```

The query DTV sends:

```graphql
query ($conditions: orders_bool_exp!) {
  totals: orders_aggregate(where: {_and: [$conditions]}) { aggregate { count sum { amount vat } } }
  overdue: orders_aggregate(where: {_and: [$conditions, {dueDate: {_lt: "…"}}]}) { aggregate { sum { amount } } }
}
```

JSON views:

```json
"aggregates": { "totals": { "select": [ { "type": "valueQuery", "field": "count" } ], "where": { … } } },
"totalCount": "totals",
"columnDefinitions": [ { "type": "tableColumn", "aggregates": ["totals"],
    "footerRenderer": { "section": "footerRenderers", "key": "…" }, … } ]
```

## Steps

1. **`@kronor/hasura-graphql`: aggregate builder.** `aggregateQueryForType<Fields>()` extends
   the row-scoped `QueryBuilder<Fields>` with `count()`, `sum(...)`, `avg(...)`, `min(...)`,
   `max(...)`. They produce the existing `valueQuery`/`objectQuery` nodes, so no new AST
   node is needed. Type tests cover the result shape (`{ count: number; sum: { amount: … } | null }`).
2. **DTV definitions.**
   - `AggregateDefinition`, `View.aggregates`, `View.totalCount`, `source.aggregateName`.
   - On columns: `aggregates` and `footerRenderer`, plus `aggregates` on `CellRendererProps`.
   - `DSL.aggregate`, and `DSL.view` / `DSL.column` typing and validation: names are GraphQL
     names, column aggregates belong to the view, and `totalCount` names an aggregate that
     selects `count`.
3. **Query and fetch.** `generateAggregatesQuery(view)`, cached per view like the data
   query, and `fetchAggregates`, which returns each aggregate's `aggregate` object by name.
4. **State.**
   - An aggregates slot in `AppState`, keyed on (view, view query, applied filters), with
     its own pending request read off the state.
   - An `aggregatesArrived` message.
   - `useAppState` fetches the pending request and aborts it once it is superseded.
   - Refresh and `DTVAPI.fetchData` refetch.
5. **UI and API.**
   - `Table` renders `footerRenderer` and passes `aggregates` to cells.
   - `TablePagination` shows the total from `totalCount`.
   - `App` gets an `onAggregatesChange(viewId, aggregates)` prop, and `DTVAPI` gets
     `getAggregates()`.
6. **JSON views.** Parse `aggregates`, `totalCount`, and column `aggregates` /
   `footerRenderer`. Runtime section `footerRenderers`.
7. **Typegen.** For a view whose `DSL.view({...})` has an `aggregates` property, emit
   `<View>Aggregate` and `<View>AggregateType` from `<root>_aggregate` (or `aggregateName`).
   Fail the view when the schema has no such field: the role cannot aggregate.
8. **Docs and example.** `docs/aggregates.md`, the README, and an aggregate on the example
   payment-requests view.
9. **Finance** (separate repo, after the 14.0.0 release). Move CreditSale over, then the
   remaining 12 tables. Delete `useDtvQueryConditions` and `DtvFooterCellsProvider`. Of its
   25 `footer:` uses (10 files), the `<DtvColumnFooter>` ones become aggregate
   `footerRenderer`s. The `searchFooter(id)` ones in `billItemListDtv.tsx` become
   `footerRenderer: () => searchFooter(id)`.

## Status (2026-11-19, branch `aggregates`)

- Steps 1–8 done, with tests. The example is `src/views/aggregates-test-view`
  (`?test-view=aggregates-test-view`), with e2e coverage in `e2e/aggregates.spec.ts`.
- The popout passes `onAggregatesChange` on; closing it reports the table's own aggregates again.
- The aggregates request is reported as an `aggregatesFetch` span. dtv-analytics lists its
  failures among the errors (migration 0004).
- Step 9 waits for a release.

## Not now

- Aggregates over a relationship in each row (`lines_aggregate` inside a row), sorting by
  them, and `count(columns:, distinct:)`.
- Totals of the selected rows. Those are computed in the browser, a different feature.
- Typegen inserting `aggregateType:` into `DSL.aggregate` calls, as it does for `rowType`.

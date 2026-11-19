# Aggregates

A view can declare Hasura aggregates over the rows the user's filters match: totals, counts,
averages, minimums and maximums of all those rows, not just the page on screen. DTV fetches them
alongside the rows and hands them to:

- column footers (`footerRenderer`),
- cell renderers (`aggregates`, e.g. for a share of the total),
- the pager, which shows "1–20 of 345" (`totalCount`),
- the host (`onAggregatesChange`, `apiRef.current.getAggregates()`).

## Declaring aggregates

Each aggregate is named. One request holds all of a view's aggregates, each an aliased
`<root>_aggregate` root field over the same conditions the rows are read with: the user's
filters, the view's `staticConditions`, and for a function view its `args`.

```ts
import { DSL } from '@kronor/dtv';
import { OrdersAggregateType, OrdersRowType } from './dtv.generated.orders';

const totals = DSL.aggregate({
    aggregateType: OrdersAggregateType,
    select: a => [a.count(), a.sum('amount', 'vat')],
});

// An aggregate can narrow the rows it aggregates with a `where` of its own
const overdue = DSL.aggregate({
    aggregateType: OrdersAggregateType,
    rowType: OrdersRowType,                   // types the `where` callback
    where: h => h.condition('dueDate', h.lt(today)),
    select: a => [a.sum('amount')],
});

export const ordersView = DSL.view({
    id: 'orders',
    source: { type: 'collection', collectionName: 'orders' },
    aggregates: { totals, overdue },
    totalCount: 'totals',                     // optional: the pager shows the total number of rows
    // ...
});
```

DTV sends:

```graphql
query ($conditions: orders_bool_exp!) {
  totals: orders_aggregate(where: $conditions) { aggregate { count sum { amount vat } } }
  overdue: orders_aggregate(where: {_and: [$conditions, {dueDate: {_lt: "…"}}]}) { aggregate { sum { amount } } }
}
```

`select` gets a builder over the aggregate type. It has `count()`, `sum(...)`, `avg(...)`,
`min(...)` and `max(...)`, which accept only the columns Hasura offers for that function. For
anything else, such as `stddev`, it also has `value` and `object`, as on the row query builder.

Names must be GraphQL names (letters, digits and underscores, not starting with a digit),
because a name is the alias of its root field. `totalCount` must name an aggregate that selects
`count`.

### The aggregate type

`dtv typegen` emits the aggregate type of each view whose `DSL.view({ ... })` has an `aggregates`
property:

```ts
// dtv.generated.orders.ts (generated)
export type OrdersAggregate = orders_aggregate_fields;
export const OrdersAggregateType = DTV.rowType<OrdersAggregate>();
```

The type is read from the schema, so what an aggregate returns is typed as Hasura returns it.
For example, `sum` of an `int` column is a `bigint`. If the schema has no `<root>_aggregate` root
field, typegen fails that view. Usually this means the role it reads the schema as is not allowed
to aggregate (Hasura's `allow_aggregations` permission). If the schema renames the field, set
`source.aggregateName`.

## Reading aggregates

Readers get each aggregate as a state:

```ts
type AggregateState<Data> =
    | { state: 'loading' }
    | { state: 'ready'; data: Data }
    | { state: 'error' };
```

- **`loading`:** the aggregates are being fetched for the filters just applied. A result for
  other filters is never shown next to rows it was not computed for.
- **`error`:** their request failed. The rows are shown all the same.

Paging, sorting and changing rows per page reuse the aggregates. Applying other filters, a change
in what the host has the view read with, a refresh, and `apiRef.current.fetchData()` fetch them
again.

### In columns

A column declares the aggregates it reads, under the names the view gives them. Its
`footerRenderer` and `cellRenderer` get their states as `aggregates`, typed by what each one
selects:

```ts
DSL.column({
    rowType: OrdersRowType,
    aggregates: { totals },
    id: 'amount',
    name: 'Amount',
    data: [q.value({ field: 'amount' })],
    cellRenderer: ({ data, aggregates }) => {
        const total = aggregates.totals.state === 'ready' ? aggregates.totals.data.sum?.amount : null;
        return total ? `${data.amount} (${Math.round(data.amount / total * 100)}%)` : data.amount;
    },
    footerRenderer: ({ aggregates, components, createElement }) =>
        aggregates.totals.state === 'ready'
            ? createElement(components.CurrencyAmount, { amount: aggregates.totals.data.sum?.amount ?? 0, currency: 'SEK' })
            : null,
});
```

`DSL.fieldColumn` takes `aggregates` and `footerRenderer` too. `DSL.view` throws when a column
reads an aggregate that the view does not have under that name.

`footerRenderer` takes the place of the static `footer`, which still works as before.

### In the host

```tsx
<App
    views={[ordersView]}
    onAggregatesChange={(viewId, aggregates) => {
        // aggregates.totals, aggregates.overdue: typed by the views passed in
    }}
    apiRef={apiRef}
/>
// apiRef.current.getAggregates() → { viewId, aggregates }
```

`onAggregatesChange` is called with every change: when the aggregates are asked for, arrive or
fail, and when another view is selected. It is not called for a view without aggregates.

## JSON views

```json
{
    "source": { "type": "collection", "collectionName": "orders" },
    "aggregates": {
        "totals": { "select": [
            { "type": "valueQuery", "field": "count" },
            { "type": "objectQuery", "field": "sum", "selectionSet": [{ "type": "valueQuery", "field": "amount" }] }
        ] },
        "overdue": { "select": [ … ], "where": { "kind": "where", "path": ["status"], "operator": { "_eq": "OVERDUE" } } }
    },
    "totalCount": "totals",
    "columns": [{
        "type": "tableColumn",
        "aggregates": ["totals"],
        "footerRenderer": { "section": "footerRenderers", "key": "amountTotal" },
        …
    }]
}
```

Footer renderers come from the runtime's `footerRenderers` section.

## Not supported yet

- Aggregates of a relationship inside each row (`lines_aggregate`), sorting by them, and
  `count(columns:, distinct:)`.
- Analytics events for the aggregates request.

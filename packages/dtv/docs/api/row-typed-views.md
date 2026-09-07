# Row-Typed Views (TS DSL)

A TypeScript view can tell DTV which GraphQL row it is built on. Everything the
view then declares — columns, filters, Hasura conditions, nested selections — is
checked against that row: field paths have to exist, controls have to be able to
produce the type of the field they filter, and operators have to be ones Hasura
offers for that type.

This is opt-in. A view that passes no row type keeps working exactly as before,
and JSON views are unaffected (they are validated at runtime by the view
parser, not by these types).

## Getting the row type

`dtv typegen` derives the row type from the schema and writes it next to each
view module, exporting both a type and a phantom value:

```ts
// dtv.generated.payment-requests.ts  (generated)
export type PaymentRequestsRow = PaymentRequest;
export const PaymentRequestsRowType = DTV.rowType<PaymentRequestsRow>();
```

It also adds `rowType:` to the `DSL.column(...)` and `DSL.filter(...)` calls
written inline in the view, so in practice the wiring is done for you. See
[../typegen.md](../typegen.md). To write it by hand, `rowType<Row>()` produces
the phantom value from any row type you already have.

## Columns

```ts
DSL.column({
    rowType: PaymentRequestsRowType,
    id: 'amount',
    name: 'Amount',
    data: [valueQuery({ field: 'amount' })],
    orderBy: 'amount',
    cellRenderer: ({ data }) => data.amount   // typed from the row, not `any`
});
```

`data` selections are checked against the row (including nested object and
array selections), and the `cellRenderer`'s `data` argument is derived from
them with the row's own nullability preserved.

## Filters

```ts
DSL.filter({
    rowType: PaymentRequestsRowType,
    id: 'status',
    label: 'Status',
    expression: FilterExpr.equals({
        field: 'status',
        control: FilterControl.dropdown({
            items: [{ label: 'Paid', value: 'paid' }, { label: 'Pending', value: 'pending' }]
        })
    })
});
```

Three things are checked, for every leaf of the expression tree, and for every
field of an `and`/`or` field group:

| Check | Rejected example (given `amount: number`, `status: 'paid' \| 'pending'`) |
| --- | --- |
| The field path exists on the row | `field: 'amuont'`, `field: 'customer.nope'` |
| The control can produce the field's type | `field: 'amount', control: FilterControl.text()` |
| The operator exists for the field's type | `FilterExpr.iLike({ field: 'amount', … })` |

Failures read as the message itself, for example:

```
Property '"control 'text' cannot produce a value for 'amount' (type number)"'
  is missing in type … but required in type FilterTypeError<…>
```

Details worth knowing:

- **Controls.** `text` needs a string field, `number` a numeric one. `date`
  accepts string, number and `Date` fields, because Hasura's `date`,
  `timestamp` and `timestamptz` scalars are generated as `string`.
- **Item lists.** `dropdown` and `multiselect` item values are each checked
  against the field — this is what catches a typo in an enum value. A list
  column is compared against its element type. Lists built at runtime are
  widened and cannot be inspected, so they are not checked.
- **Starting values.** Every control takes an `initialValue`, typed as the value
  that control produces: a string for `text`, one of the items for `dropdown`, a
  list of them for `multiselect`, a `Date` for `date`. `customOperator` is the
  exception — its `initialValue` seeds the *inner* value, alongside
  `valueControl.initialValue`, rather than the `{ operator, value }` pair the
  control stores.
- **Multiselect.** A multiselect produces a list of values, so on a scalar
  field it is only allowed with `in`/`notIn`.
- **Operators.** The leaf operator is mapped to the Hasura operator DTV emits
  for it and looked up in `HasuraOperatorFor<Value>` — the same source of truth
  the Hasura DSL uses. `like`/`iLike` need a string field; `greaterThan` and
  friends need a comparable one; `equals`, `in`, `notIn` and `isNull` are
  always available.
- **customOperator.** Operators written inline are checked the same way, since
  the built-in transform hands them to Hasura verbatim. An operator that is not
  a Hasura operator name is left to the transform.

### Escape hatches

These are cases where the declared shape no longer describes what reaches the
query, so the control and operator checks stand down:

- **A leaf with a `transform`.** A transform may re-map the value, the field, or
  return a whole condition. Its field path is still checked, and a
  `customOperator` operator list still is too.
- **`json`/`jsonb` columns**, which are generated as `any`, and rows with an
  index signature: any control, any operator.
- **`custom` and `autocomplete` controls**, whose values are defined by a
  component or a fetcher rather than by the control.

### Transforms

A transform's `input` is typed from the control beside it, so it can be written
without a cast:

```ts
FilterExpr.equals({
    field: 'amount',
    control: FilterControl.number(),
    transform: { toQuery: input => TransformResult.value(input === null ? null : input * 100) }
    //                            input: number | null
});
```

What each control produces:

| Control | `input` |
| --- | --- |
| `text` | `string` |
| `number` | `number \| null` |
| `date` | `Date` |
| `dropdown` | the union of its item values |
| `multiselect` | an array of them |
| `autocomplete` | the item type its `suggestionFetcher` returns, or an array of them when `multiple: true` |
| `customOperator` | `{ operator, value }`, with `operator` narrowed to the operators it offers |
| `custom` | the value type of the component's `onChange`, else `unknown` |
| any of them, assembled at runtime | widened, as far as the list allows |

A transform that takes `unknown` still compiles, so existing ones need no
change; the type is what the control declares, not a guarantee. The same value
can also arrive as an `initialValue`, out of persisted filter state, from the
AI assistant, or from a consumer calling `setFilterState` — so a transform
facing those should still check what it gets.

On the row-scoped builder the transform is a **second argument**, which is what
lets each check be reported on the property that caused it while `input` stays
typed:

```ts
F.iLike(
    { field: 'amount', control: FilterControl.text() },
    { toQuery: input => TransformResult.value(Number(input)) }
    //          input: string
);
```

A transform is also told which filter it belongs to. `context.field` is the very
path the leaf declares, so the row-scoped Hasura DSL takes it directly and
resolves the field's type from it:

```ts
F.greaterThan(
    { field: 'amount', control: FilterControl.number() },
    { toQuery: (input, context) => TransformResult.condition(H.condition(context.field, H.gt(Number(input)))) }
    //                                                       ^ 'amount', so H rejects H.ilike here
);
```

`context.result` holds the `TransformResult` builders — the same ones the module
exports, so a transform need not import them — with `fieldValue` restricted to
the row, since redirecting a filter to another field deserves the same check as
declaring it:

```ts
F.equals(
    { field: 'id', control: FilterControl.text() },
    { toQuery: (input, context) => context.result.fieldValue('customer.email', input) }
);
```

### Filters whose transform owns the query

A filter can leave the query entirely to its transform — `computedCondition` has
no real field at all, and a transform is free to build a condition from a path
it closes over. The declared `field` is then meaningless to whoever reads the
applied-filter pill, which shows it.

`fieldLabel` is what the pill shows instead, so the field can stay a row path:

```ts
FilterExpr.in({
    field: 'subsidiaryId',
    fieldLabel: 'Subsidiary',
    control: FilterControl.multiselect({ items: subsidiaryItems }),
    transform: subsidiaryCondition
});
```

Without a `fieldLabel` the pill falls back to the field path, as before. A range
gives the same label to both of its bounds.

### customOperator

A `customOperator` control stores the chosen operator beside the value, and only
a transform can turn that into a condition. `buildHasuraConditions` throws when
one is missing or returns a value instead, so both are compile errors under
`filter({ rowType })`:

```ts
FilterExpr.equals({
    field: 'amount',
    control: FilterControl.customOperator({ operators, valueControl: FilterControl.number() }),
    transform: { toQuery: (input, context) => context.transform.hasuraCustomOperator.toQuery(input, context) }
});
```

Annotate a hand-written one `ConditionOnlyTransform` — a transform typed
`FilterTransform` may return either, which is not enough. A transform object
with no `toQuery` at all is rejected too; it would do nothing at query time.

### Row-scoped builders

`FilterExpr` accepts any field name and is checked when the expression reaches
`filter({ rowType })`, which reports problems on the `filter()` call. Scoping
the builder to the row instead gives the editor a row to work from:

```ts
const F = filterExprForRowType(PaymentRequestsRowType);

F.iLike({ field: 'customer.email', control: FilterControl.text() });
F.in({ field: 'status', control: FilterControl.multiselect({ items: [...] }) });
F.like({ field: F.field.or('reference', 'customer.email'), control: FilterControl.text() });
```

Field names complete as they are typed, and each problem is reported on the
property that caused it — an unsupported operator on `field`, an unusable
control on `control`. The results are ordinary `FilterExpr` values, so
`filter({ rowType })` still checks them; the row-scoped builder is about where
errors appear, not about checking more.

`hasuraDSLforRowType` and `queryForRowType` are the same idea for
condition-producing transforms and for nested selections:

```ts
const H = hasuraDSLforRowType(PaymentRequestsRowType);

H.condition('amount', H.gt(1000));            // path and operand both checked
H.scope('lines', Line => Line.condition('item.sku', Line.ilike('%SKU%')));
```

### Reusable filter helpers

The checks need a row type that is already known. In a generic helper that
builds filters for a row it hasn't been given yet, they cannot be evaluated and
are skipped rather than reported as failures — so constrain the helper's own
arguments and its callers stay checked:

```ts
function textFilter<Row, const Field extends DSL.FilterFieldPath<Row>>(
    args: { rowType: Row; id: string; label: string; field: Field }
) {
    return DSL.filter({
        rowType: args.rowType,
        id: args.id,
        label: args.label,
        expression: FilterExpr.equals({ field: args.field, control: FilterControl.text() })
    });
}
```

A helper that picks the control itself only makes sense on one kind of column,
and can say so — `ValidateFilterFieldType<Row, Field, Value>` brands the field
parameter, and is `unknown` when the field holds that type:

```ts
function numberRangeFilter<Row, const Field extends DSL.FilterFieldPath<Row>>(args: {
    rowType: Row;
    id: string;
    label: string;
    field: Field & DSL.ValidateFilterFieldType<Row, Field, number>;
}) { /* ... */ }

numberRangeFilter({ rowType: PaymentRequestsRowType, id: 'amount', label: 'Amount', field: 'amount' });
numberRangeFilter({ rowType: PaymentRequestsRowType, id: 'when', label: 'When', field: 'createdAt' });
//                                       field 'createdAt' holds string, and this filter needs number
```

That restores at the call site what the helper's own body cannot check. It
resolves the type of the one field it is given rather than selecting the row's
fields by type: enumerating every path and resolving each one costs work
proportional to the size of the row, and exceeded TypeScript's instantiation
limit on real generated rows of around 900 lines.

Two things to know about what it accepts: nullability is ignored, so a
`number | null` column counts as numeric; and Hasura's `date`, `timestamp` and
`timestamptz` scalars are generated as `string`, so a date helper should ask for
`string | Date` rather than `Date`. Arrays are not unwrapped — ask for
`string[]` to match a list column.

## What is not checked yet

- A view does not tie its columns and filters together: nothing stops a filter
  built for one row type from being placed in a view over another.
- `boolExpType`, `orderByType`, `paginationKey` and `staticOrdering` on a view
  are plain strings.
- A transform's *output* is only partly checked: `context.result.fieldValue`
  restricts the field it redirects to, but not the value it produces, nor the
  row a returned condition was built against.
- JSON views get none of this.

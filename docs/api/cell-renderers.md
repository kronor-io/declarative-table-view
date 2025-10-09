# Cell Renderer API

Cell renderers are React functions responsible for rendering the contents of each table cell.
They are referenced from JSON view definitions via a runtime reference of the form:

```jsonc
{
    "section": "cellRenderers",
    "key": "transaction"
}
```

The runtime must expose a matching function under `runtime.cellRenderers.transaction`.

## Type Signature
```
import { CellRenderer } from "src/framework/column-definition";

export type CellRenderer = (props: CellRendererProps) => React.ReactNode;

export type CellRendererProps = {
  data: Record<string, any>;
  setFilterState: (updater: (current: FilterState) => FilterState) => void;
  applyFilters: () => void;
  updateFilterById: (filterId: string, updater: (currentValue: any) => any) => void;
  createElement: typeof React.createElement;
  components: { Badge; FlexRow; FlexColumn; Mapping; DateTime; CurrencyAmount; Link; };
  currency: { majorToMinor: (major: number, code: string, locale?: string) => number; minorToMajor: (minor: number, code: string, locale?: string) => number };
};
```

### Provided Props
- `data`: Object containing the resolved data fields for this column. Its structure is derived from the column's `data` field array in the JSON definition. For nested/query configs additional keys may be present (e.g. `attempts.cardType`).
- `setFilterState(updater)`: Low-level state setter for the full filter map. Prefer `updateFilterById` for targeted updates.
- `applyFilters()`: Triggers a new data fetch after mutating filter state programmatically.
- `updateFilterById(filterId, updater)`: Focused helper to update the internal form state of a single filter (tree structure) in-place.
- `createElement`: Re-exported `React.createElement` for advanced dynamic element factories (rarely needed).
- `components`: Convenience bundle of commonly used primitives:
  - `Badge` (`Tag` from PrimeReact) — for status-like labels
  - `FlexRow` / `FlexColumn` — layout helpers with gap/align/justify props
  - `Mapping` — map raw values to labels (`<Mapping value={merchantId} map={{1: 'Boozt'}} />`)
  - `DateTime` — localized date/time formatting
  - `CurrencyAmount` — currency formatting with `Intl.NumberFormat`
  - (prop) `currency` — helpers for unit conversion (major/minor units)
  - `Link` — styled anchor element

## Creating a Cell Renderer
```tsx
// runtime.tsx
export const myRuntime: Runtime = {
    cellRenderers: {
        // Example where the GraphQL field "amountMinor" is stored in minor units (e.g. cents)
        amount: ({
            data: { currency, amountMinor },
            components: { FlexRow, CurrencyAmount },
            currency: { minorToMajor }
        }) => {
            // Convert minor (integer) units to major for display using provided helper
            const majorAmount = minorToMajor(amountMinor, currency);
            return (
                <FlexRow justify="end">
                    <CurrencyAmount amount={majorAmount} currency={currency} />
                </FlexRow>
            );
        }
    },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {}
};
```

If your amount field already arrives as a major unit (e.g. 123.45 for USD) you can skip the `minorToMajor` call and pass it directly to `CurrencyAmount`.

## Referencing in JSON View
```jsonc
{
  "data": [ { "type": "field", "path": "currency" }, { "type": "field", "path": "amount" } ],
  "name": "Amount",
  "cellRenderer": { "section": "cellRenderers", "key": "amount" }
}
```

## Programmatic Filtering Example
A cell renderer can trigger a filter update upon interaction:
```tsx
initiatedBy: ({ data, updateFilterById, applyFilters, components: { FlexRow, FlexColumn } }) => {
  const handleEmailClick = () => {
    updateFilterById('customer-email', current => ({
      ...current,
      value: { operator: '_eq', value: data['customer.email'] }
    }));
    applyFilters();
  };
  return (
    <FlexRow align="center">
      <FlexColumn>
        <span className="tw:font-bold">{data['customer.name']}</span>
        <button className="tw:text-blue-500 tw:underline" onClick={handleEmailClick}>
          {data['customer.email']}
        </button>
      </FlexColumn>
    </FlexRow>
  );
}
```

## Data Shape Notes
- Each `data` entry in the column definition becomes a property on the `data` object using its `path`.
- For `queryConfigs`, nested results may be flattened (e.g. `attempts.cardType`). The exact flattening logic mirrors the GraphQL query builder.

## Best Practices
- Keep renderers pure (avoid side effects except in event handlers).
- Pull layout primitives from `components` to stay consistent.
- Guard against missing fields (`data.someKey ?? '-'`).
- Limit expensive computations; precompute in transforms/query if possible.
- Use `updateFilterById` + `applyFilters` for instant filtering interactions.

## Error Handling
If a reference key is missing, parsing the JSON view will throw an error listing available keys, preventing runtime ambiguity.

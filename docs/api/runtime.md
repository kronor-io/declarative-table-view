# Runtime Object

The `Runtime` aggregates all pluggable functions and components that a JSON view can reference.
It is defined in `src/framework/runtime.ts`:

```ts
export type Runtime = {
  cellRenderers: Record<string, CellRenderer | React.ComponentType<any>>;
  queryTransforms: Record<string, { toQuery: (input: any) => TransformResult }>;
  noRowsComponents: Record<string, NoRowsComponent | React.ComponentType<any>>;
  customFilterComponents: Record<string, React.ComponentType<any>>;
  initialValues: Record<string, any>;
};
```

## Sections
| Section | Purpose | Reference Usage | Value Type |
|---------|---------|-----------------|------------|
| `cellRenderers` | Render table cells | Column `cellRenderer` | `(props) => ReactNode` |
| `queryTransforms` | Preprocess raw filter form values into GraphQL-ready values | Filter expression `transform` | `{ toQuery(input) => { value, operator?, ... } }` |
| `noRowsComponents` | UI when a data query yields zero rows | View `noRowsComponent` | `(props) => ReactNode` |
| `customFilterComponents` | Custom input widgets inside filter forms | Filter control `{ type: 'custom' }` | React component |
| `initialValues` | Dynamic initial values resolved at parse time | Any `initialValue` field | any |

## Resolution Precedence
When parsing a view JSON, runtime references are resolved via:
1. External runtime passed to the <ViewRenderer /> (if any)
2. Built-in (view-specific) runtime exported alongside the JSON

If a key does not exist in either location an error is thrown with a list of known keys for that section.

## Example Runtime
```tsx
export const paymentRequestsRuntime: Runtime = {
  cellRenderers: { /* ... */ },
  queryTransforms: {
    reference: { toQuery: input => input.operator === '_like' ? { value: { value: `${input.value}%` } } : { value: input } },
    amount: { toQuery: input => input ? { value: input * 100 } : { value: input } }
  },
  noRowsComponents: { noRowsExtendDateRange: NoRowsExtendDateRange },
  customFilterComponents: { phoneNumberFilter: PhoneNumberFilter },
  initialValues: {
    dateRangeStart: (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d; })(),
    dateRangeEnd: new Date()
  }
};
```

## Adding a New Section Entry
```ts
// Add a transform
runtime.queryTransforms.orderId = {
  toQuery: (input) => input ? { value: input.trim().toUpperCase() } : { value: input }
};
```

## Transform Contract
A transform receives the raw leaf value (or structured operator object for custom operator controls) and returns an object merged into the GraphQL boolean expression builder. Common pattern:
```ts
{ toQuery: (input) => ({ value: input }) }
```
You can wrap/reshape the value as needed (e.g. apply wildcards, multiply for minor units, split strings, etc.).

## Initial Values via Runtime Reference
Any `initialValue` field inside filter controls can be replaced with a runtime reference:
```jsonc
"initialValue": { "section": "initialValues", "key": "dateRangeStart" }
```
This allows dynamic (computed at parse time) defaults.

## Debugging Missing References
If parsing fails with: `Reference "foo" not found in cellRenderers. Available keys: a,b,c` verify:
- The key exists in either runtime instance.
- The JSON `section` name matches the correct section.
- There are no typos (keys are case-sensitive).

## Testing
See `runtime-reference.test.ts` for validation tests around resolution and error messages.

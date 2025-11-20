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
  suggestionFetchers: Record<string, SuggestionFetcher>;
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
| `suggestionFetchers` | Async suggestion providers for autocomplete filter controls | Autocomplete FilterControl `suggestionFetcher` | `(query: string, client: GraphQLClient) => Promise<{ label: string; value: any }[]>` |

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
  },
  suggestionFetchers: {
    emailDomainSuggestions: async (query: string, client: GraphQLClient) => {
      // client can be used for remote lookups; demo keeps it local
      if (!query.includes('@')) return [];
      const domain = query.split('@')[1] ?? '';
      return ['gmail.com','yahoo.com','outlook.com','icloud.com']
        .filter(d => d.startsWith(domain))
        .map(d => ({ label: `${query.split('@')[0]}@${d}`, value: `${query.split('@')[0]}@${d}` }));
    }
  }
};
```

## Adding a New Section Entry
```ts
// Add a transform
runtime.queryTransforms.orderId = {
  toQuery: (input) => input ? { value: input.trim().toUpperCase() } : { value: input }
};

// Add a suggestion fetcher
runtime.suggestionFetchers.productNames = async (query, client) => {
  if (!query) return [];
  const all = ['Shoe', 'Shirt', 'Sock', 'Scarf'];
  return all.filter(name => name.toLowerCase().startsWith(query.toLowerCase()))
            .map(name => ({ label: name, value: name }));
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
## Autocomplete Filter Control
Define an autocomplete filter in JSON using a runtime reference to a `suggestionFetcher`:

```jsonc
{
  "type": "equals",
  "field": "customer_email",
  "value": {
    "type": "autocomplete",
    "label": "Customer Email",
    "placeholder": "Type email...",
    "suggestionFetcher": { "section": "suggestionFetchers", "key": "emailDomainSuggestions" }
  }
}
```

Contract: The suggestion fetcher receives the current user input and the active GraphQL client and returns a promise of an array like:
`[{ "label": "User Friendly Label", "value": "StoredValue" }]`.

The filter form invokes the suggestion fetcher on each change and renders dropdown suggestions (Primereact `AutoComplete` with `dropdown` enabled).
See `runtime-reference.test.ts` for validation tests around resolution and error messages.

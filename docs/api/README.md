# View DSL API Documentation

This folder contains detailed API documentation for the runtime extension points of the View DSL:

- Cell Renderers (`cellRenderers`)
- Runtime Object (`Runtime`)
- No Rows Components (`noRowsComponents` and per-view `noRowsComponent`)
- Custom Filter Components (`customFilterComponents`)
- Query Transforms (`queryTransforms`)
- Initial Values (`initialValues`)
- Static Conditions (`staticConditions` on a View)
- Optional column `orderBy` fields for sortable headers

Each extension point is referenced from JSON view definitions using a Runtime Reference object:

```jsonc
{
    "section": "cellRenderers", // one of: cellRenderers, noRowsComponents, customFilterComponents, queryTransforms, initialValues, suggestionFetchers
    "key": "transaction"        // the key inside the runtime section
}
```

Resolution precedence: External (per-app) runtime overrides Built-in runtime. If the key is missing in both, an error is thrown listing available keys.

---
## AI Assistant Prompt
- Views can optionally provide `defaultAIFilterPrompt` to seed the AI assistant's input. When present, `AIAssistantForm` initializes its prompt from the selected view and updates when the view changes.
- JSON example:
    ```jsonc
    {
        "title": "Payment Requests",
        "id": "payment-requests",
        // ...
        "defaultAIFilterPrompt": "authorized payments in euro or danish krona in the first week of april 2025"
    }
    ```

## Files
- `cell-renderers.md` — How to write cell renderer functions and available helper components.
- `runtime.md` — Structure of the `Runtime` object and how runtime references are resolved.
- `no-rows-component.md` — Authoring components shown when a view returns zero rows.

Add additional docs here for transforms, custom filters, etc. as needed.

## Column Ordering
- Table column headers are sortable when DTV can map the column to a GraphQL order field.
- A table column with exactly one simple `valueQuery` automatically orders by that field.
- For rendered or composite columns, set `orderBy` on the table column JSON to one of the scalar GraphQL fields selected by `data` to enable sorting.
- `orderBy` may be a dot-separated path for nested order fields, such as `customer.profile.status`.
- Users can order by one sortable header at a time. Clicking a sorted header a third time removes the header ordering.

```jsonc
{
    "type": "tableColumn",
    "id": "customerName",
    "data": [
        {
            "type": "objectQuery",
            "field": "customer",
            "selectionSet": [
                {
                    "type": "objectQuery",
                    "field": "profile",
                    "selectionSet": [{ "type": "valueQuery", "field": "lastName" }]
                }
            ]
        }
    ],
    "name": "Customer",
    "orderBy": "customer.profile.lastName",
    "cellRenderer": { "section": "cellRenderers", "key": "text" }
}
```

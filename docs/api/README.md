# View DSL API Documentation

This folder contains detailed API documentation for the runtime extension points of the View DSL:

- Cell Renderers (`cellRenderers`)
- Runtime Object (`Runtime`)
- No Rows Components (`noRowsComponents` and per-view `noRowsComponent`)
- Custom Filter Components (`customFilterComponents`)
- Query Transforms (`queryTransforms`)
- Initial Values (`initialValues`)
 - Static Conditions (`staticConditions` on a View)

Each extension point is referenced from JSON view definitions using a Runtime Reference object:

```jsonc
{
    "section": "cellRenderers", // one of: cellRenderers, noRowsComponents, customFilterComponents, queryTransforms, initialValues
    "key": "transaction"        // the key inside the runtime section
}
```

Resolution precedence: External (per-app) runtime overrides Built-in runtime. If the key is missing in both, an error is thrown listing available keys.

---

## Files
- `cell-renderers.md` — How to write cell renderer functions and available helper components.
- `runtime.md` — Structure of the `Runtime` object and how runtime references are resolved.
- `no-rows-component.md` — Authoring components shown when a view returns zero rows.
 - `static-conditions.md` — Defining always-on GraphQL boolean expressions via `staticConditions`.

Add additional docs here for transforms, custom filters, etc. as needed.

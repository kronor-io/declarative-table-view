# No Rows Component API

A No Rows Component renders contextual UI when a view's data query returns zero rows.
It can guide the user to broaden filters, change date ranges, or provide helpful links.

## Type Signature
Defined in `src/framework/view.ts`:
```
export type NoRowsComponentProps = {
  setFilterState: (updater: (current: FilterState) => FilterState) => void;
  filterState: FilterState;
  applyFilters: () => void;
  updateFilterById: (filterId: string, updater: (current: FilterFormState) => FilterFormState) => void;
};
export type NoRowsComponent = (props: NoRowsComponentProps) => React.ReactNode;
```

In a runtime, entries live under `runtime.noRowsComponents`:
```ts
noRowsComponents: {
  noRowsExtendDateRange: NoRowsExtendDateRange
}
```

## Referencing in View JSON
```jsonc
"noRowsComponent": { "section": "noRowsComponents", "key": "noRowsExtendDateRange" }
```

## Example Component
`src/views/payment-requests/components/NoRowsExtendDateRange.tsx`:
```tsx
const NoRowsExtendDateRange = ({ updateFilterById, applyFilters }) => {
  const handleExtend = () => {
    updateFilterById('date-range', currentFilter => {
      if (currentFilter.type === 'and' && currentFilter.children.length > 0) {
        const firstChild = currentFilter.children[0];
        if (firstChild.type === 'leaf') {
          const d = new Date(firstChild.value); d.setMonth(d.getMonth() - 1);
          return { ...currentFilter, children: [{ ...firstChild, value: d }, ...currentFilter.children.slice(1)] };
        }
      }
      return currentFilter;
    });
    applyFilters();
  };
  return (
    <FlexColumn align="center" justify="center" className="py-8 text-gray-400">
      <span>No data rows match the current filter.</span>
      <Button label="Extend the date range back by 1 month" onClick={handleExtend} size="small" />
    </FlexColumn>
  );
};
```

## When to Use
- Suggesting filter adjustments (expand date range, clear a value).
- Offering quick actions (e.g. buttons to reset filters).
- Providing guidance (links to documentation or onboarding steps).

## Best Practices
- Keep height modest; avoid pushing layout drastically.
- Provide at most 1–2 primary actions.
- Don't auto-modify filters without explicit user interaction.
- Use neutral/secondary styling to differentiate from loaded data states.

## Advanced Interactions
You have full access to the current filter tree via `filterState` if deeper introspection is required (e.g. determining which specific filter is most restrictive). Modify only what is necessary for clarity.

## Error Handling
If the referenced key is missing in the runtime, parsing the view JSON will throw with available keys to aid discovery.

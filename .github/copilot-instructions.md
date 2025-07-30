# Copilot Instructions for view-dsl

## Project Overview
- This is a React + TypeScript monorepo using Vite for development/build, Playwright for E2E tests, and Jest for unit tests.
- The core domain is a declarative, schema-driven table view system for filtering, displaying, and interacting with data collections.
- Major code is in `src/`, with key subfolders:
  - `src/framework/`: Table/view schema, filter logic, state, and data fetching.
  - `src/components/`: UI components, including filter forms, AI assistant, and table rendering.
  - `src/views/`: View definitions, each exporting a `View` object with schema, columns, and query config.

## Key Patterns & Conventions
- **Filter Schema**: Filters are defined in `FilterFieldSchema` objects, with each filter requiring an `aiGenerated: boolean` field. See `src/framework/filters.ts` for types and helpers.
- **AI Integration**: The AI assistant (see `src/components/AIAssistantForm.tsx` and `src/components/aiAssistant.ts`) can generate filters, which must set `aiGenerated: true`.
- **View Registration**: Each view (e.g., `paymentRequest.tsx`) exports a `View` object with a `filterSchema`, `columnDefinitions`, and a GraphQL query.
- **Type Safety**: All filter and view schemas are strongly typed. When adding new filters, always specify all required fields.
- **Cell Renderers**: All cell renderers receive `setFilterState` as a required prop, allowing them to programmatically update filter state when users interact with table cells.

## Testing
- **Unit Tests**: Run with `npm run test-unit` (Jest)
- **E2E Tests**: Run with `npm test` or `npm run test` (Playwright)
- E2E test files are located in `e2e/` directory
- Unit test files use `.test.ts` or `.test.tsx` extensions
- The file `COPILOT_TEST_COMMAND.txt` in the repo root also specifies the canonical unit test command for AI tools.

## Integration & Data Flow
- Data is fetched via GraphQL using `graphql-request` (see `src/framework/data.ts`).
- Views define their own GraphQL queries and filter schemas.
- Filter expressions are serialized/deserialized using helpers in `src/framework/filters.ts`.

## Project-Specific Advice
- Always update all usages of schema types when changing filter/view schema fields.
- When adding new filters, ensure `aiGenerated` is set appropriately.
- Use the helpers in `src/framework/filters.ts` for building filter expressions and controls.
- All cell renderers must accept `setFilterState` as a required prop for programmatic filter updates.
- For new E2E tests, add Playwright specs in `e2e/`.
- For new unit tests, add Jest specs with `.test.ts` or `.test.tsx` extensions.

## Examples
- See `src/views/paymentRequest.tsx` for a full-featured view definition.
- See `src/components/AIAssistantForm.tsx` for AI-driven filter generation.
- See `src/framework/filters.ts` for filter schema/type definitions and utilities.

---
If you are unsure about a workflow or convention, check for a helper or type in `src/framework/` or look for examples in `src/views/` and `src/components/`.

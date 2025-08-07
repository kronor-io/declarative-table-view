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
- **View Registration**: Views can be defined in two formats:
  - **TSX Format** (legacy): Each view exports a `View` object with schema, columns, and query config
  - **JSON Format** (new): Views are organized in folders with `view.json` (schema) and `runtime.tsx` (cell renderers)
  - See `src/views/simple-test-view/` and `src/views/request-log/` for JSON format examples
  - See `src/views/payment-requests/` for TSX format example
- **Type Safety**: All filter and view schemas are strongly typed. When adding new filters, always specify all required fields.
- **Cell Renderers**: All cell renderers receive `setFilterState` as a required prop, allowing them to programmatically update filter state when users interact with table cells.

## Testing & Code Quality
- **Unit Tests**: Run with `npm run test-unit` (Jest)
- **E2E Tests**: Run with `npm test` or `npm run test` (Playwright)
- **Linting**: Run with `npm run lint` (ESLint with TypeScript)
- E2E test files are located in `e2e/` directory
- Unit test files use `.test.ts` or `.test.tsx` extensions
- The file `COPILOT_TEST_COMMAND.txt` in the repo root also specifies the canonical unit test command for AI tools.

### Linting & Code Standards
- ESLint is configured with TypeScript, React hooks, and React refresh rules
- Pre-commit hooks automatically run linting and tests before commits
- CI pipeline runs linting, unit tests, and E2E tests on push/PR
- **EditorConfig**: Follow `.editorconfig` formatting rules for all files:
  - Use 4 spaces for indentation (TypeScript, TSX, JSON)
  - UTF-8 encoding with LF line endings
  - Insert final newline and trim trailing whitespace
  - When generating or editing JSON files, always use 4-space indentation to match project standards
- Key rules:
  - `@typescript-eslint/no-explicit-any` is disabled to allow `any` types when needed
  - Use `@ts-expect-error` with descriptive comments instead of `@ts-ignore`
  - React Hook dependency warnings can be suppressed with `// eslint-disable-next-line react-hooks/exhaustive-deps` when intentional
  - Fast refresh warnings are acceptable (non-blocking) for files that export both components and utilities

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

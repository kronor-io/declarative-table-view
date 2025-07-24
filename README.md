# Declarative Table View System

This project is a React + TypeScript monorepo for building schema-driven, declarative table views with advanced filtering, data fetching, and AI-assisted filter generation.

## Project Overview
- **Framework:** React, TypeScript, Vite
- **Testing:** Jest (unit), Playwright (E2E)
- **Core Domain:** Declarative, schema-driven table view system for filtering, displaying, and interacting with data collections.
- **Key Directories:**
  - `src/framework/`: Table/view schema, filter logic, state, and data fetching.
  - `src/components/`: UI components, including filter forms, AI assistant, and table rendering.
  - `src/views/`: View definitions, each exporting a `View` object with schema, columns, and query config.

## Key Patterns & Conventions
- **Filter Schema:** Filters are defined in `FilterFieldSchema` objects. Each filter requires an `aiGenerated: boolean` field. See `src/framework/filters.ts` for types and helpers.
- **AI Integration:** The AI assistant (see `src/components/AIAssistantForm.tsx` and `src/components/aiAssistant.ts`) can generate filters, which must set `aiGenerated: true`.
- **View Registration:** Each view (e.g., `paymentRequest.tsx`) exports a `View` object with a `filterSchema`, `columnDefinitions`, and a GraphQL query.
- **Type Safety:** All filter and view schemas are strongly typed. When adding new filters, always specify all required fields.

## Integration & Data Flow
- Data is fetched via GraphQL using `graphql-request` (see `src/framework/data.ts`).
- Views define their own GraphQL queries and filter schemas.
- Filter expressions are serialized/deserialized using helpers in `src/framework/filters.ts`.

## Development

### Install dependencies
```sh
npm install
```

### Environment Variables
Create a `.env.development` file in the project root to set environment variables for local development (e.g., API endpoints, feature flags, secrets).

Example:
```env
VITE_GRAPHQL_HOST=https://your-graphql-host.example.com
VITE_GRAPHQL_TOKEN=your-graphql-token-here
VITE_GEMINI_API_KEY=your-gemini-api-key-here
```

### Start development server
```sh
npm run dev
```

### Run unit tests
```sh
npm run test-unit
```

### Run E2E tests (Playwright)
```sh
npm test
# or
npm run test
```

## Examples
- See `src/views/paymentRequest.tsx` for a full-featured view definition.
- See `src/components/AIAssistantForm.tsx` for AI-driven filter generation.
- See `src/framework/filters.ts` for filter schema/type definitions and utilities.

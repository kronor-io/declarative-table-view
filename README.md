# Declarative Table View System

This project is a React + TypeScript monorepo for building schema-driven, declarative table views with advanced filtering, data fetching, and AI-assisted filter generation.

## Library Consumption

You can consume the `App` component as a library bundle with embedded styles (Tailwind + PrimeReact + PrimeIcons + PrimeFlex) without importing separate CSS files.

### Build the library

```sh
npm run build:lib
```

Outputs:
- `dist/index.es.js` (ES module bundle with runtime-injected CSS)
- `dist/types` (Type declarations, root `index.d.ts`)

### Import in your application

```ts
import { App } from '@kronor/dtv';
import type { AppProps } from '@kronor/dtv';
```

All required styles are injected automatically via the JS bundle (using `vite-plugin-css-injected-by-js`).

### Runtime Options (AppProps)
Key props you can pass to `App` (or via `dtv.renderTableView` in `main.tsx`):

- `graphqlHost` / `graphqlToken`: GraphQL endpoint + bearer auth token.
- `geminiApiKey`: API key used by the AI Filter Assistant.
- `viewsJson`: JSON string array of view definitions (each view.json parsed at runtime).
- `showViewsMenu`: Toggle the views dropdown menu (default: `false`).
- `showViewTitle`: Toggle the view title heading (default: `false`).
- `showCsvExportButton`: Toggle the "Export page to CSV" button (default: `false`). When enabled, current page rows are exported using PrimeReact's built-in DataTable CSV exporter.
- `showPopoutButton`: Toggle the Popout button that opens the table view in a fullscreen overlay (default: `true`). Set to `false` to suppress this UI in embedded contexts.
- `rowsPerPage`: Page size for pagination (default: `20`).
- `externalRuntime`: Provide a runtime override for cell renderers / query transforms.
- `syncFilterStateToUrl`: Persist applied filter state into the `dtv-filter-state` URL param (default: `false`).

Example:
```ts
dtv.renderTableView('root', {
  graphqlHost: 'https://example/graphql',
  graphqlToken: 'token',
  geminiApiKey: 'gemini-key',
  viewsJson: JSON.stringify([myViewJson]),
  showViewTitle: true,
  showCsvExportButton: true,
  syncFilterStateToUrl: true
});
```

### Peer Dependencies

React and ReactDOM 19 are peer dependencies; ensure they are installed in the host project.

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
 - Unified URL Filter Param: Both share links and persistence use a single base64 URL-safe encoded parameter `dtv-filter-state`. Enable syncing by passing `syncFilterStateToUrl: true` to `dtv.renderTableView` (or `?sync-filter-state-to-url=true` in dev). The param is updated only when filters are applied (not on every change). When disabled, a one-off link is consumed (param removed after load).

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

## Release Process

Automated release script performs validation (lint, build, unit + e2e tests), builds the library bundle, bumps the version, pushes git tags, and publishes to npm.

### Run a release
```sh
npm run release
```
You'll be prompted for the semver bump (`patch`, `minor`, or `major`). Default is `patch` if you press Enter.

### Options / Flags
```sh
npm run release -- --type=minor      # Non-interactive minor release
npm run release -- --dry             # Run validations only; skip version/tag/publish
npm run release -- --skip-e2e        # Skip Playwright tests (use sparingly)
npm run release -- --skip-unit       # Skip Jest tests (NOT recommended)
npm run release -- --allow-dirty     # Allow running with uncommitted changes (avoids safety check)
```

### Requirements
- You must be authenticated with npm (`npm login`).
- Git working tree must be clean (unless using `--allow-dirty`).
- CI should pass for the commit you are releasing.

### What it does
1. Lints source code.
2. Builds application (`npm run build`).
3. Runs unit tests (Jest) and E2E tests (Playwright).
4. Builds library bundle (`npm run build:lib`).
5. Bumps version via `npm version <type>` (commit + tag).
6. Pushes commit and tags.
7. Publishes to npm (`npm publish --access public`).

Use `--dry` first if you want to verify everything without changing the version or publishing.

## Examples
- See `src/views/paymentRequest.tsx` for a full-featured view definition.
- See `src/components/AIAssistantForm.tsx` for AI-driven filter generation.
- See `src/framework/filters.ts` for filter schema/type definitions and utilities.

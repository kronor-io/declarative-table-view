# DTV analytics: design

`@kronor/dtv-analytics` reads the events DTV reports through `analytics` (see
[Analytics](../../dtv/docs/analytics.md)) and the users' stored DTV user data, and shows how an
app's tables are used: which views and filters people use, how fast they are, what fails, and
what nobody uses.

The first host is finance, which stores events in `logs.dtv_event` and user data in
`finance.dtv_user_data`, both readable through its Hasura with the `dtv_analytics_query` role.
The package does not know about finance: a host describes where its data is.

## Decisions

| Question | Decision |
|---|---|
| Form | A local tool: a server, a store and an app, started from the host's repository. No page in finance. |
| Where | `packages/dtv-analytics` in the DTV monorepo: the app and the CLI in TypeScript, the server as a cabal project beside them. |
| Server | Haskell. It fetches from the host, keeps what it fetched, derives what the metrics need, and streams all of it. |
| Fetching | On demand: the app shows what is stored, names the parts of the period not fetched, and fetches them when its Fetch button is pressed. Nothing is fetched twice. |
| Store | A local Postgres. Hasura serves it as GraphQL to the app. |
| Configuration | The host's own `dtv-analytics.config.ts`, typed by the package: DTV core does not know about analytics. |
| Definitions | The CLI finds the `dtv-migrations` chains `dtv definitions` writes, bundles them into one JS file, and a Node sidecar of the server runs it. |
| Host fields | Only DTV's envelope, `id`, `userId`, `createdAt` and `payload` are required of a source. What a host adds (impersonation, route, app version, link source, a revision of user data, users' names) is read when it is there. |
| Credentials | A Hasura JWT and a Cloudflare service token or cookie, entered in the app and held in the server's memory. A local source can name headers whose values are environment variables instead (an admin secret). |
| Running | A Docker image of the server, in a compose project with Postgres and Hasura. |
| People | Names and free text (prompts, searches, saved filter names) are shown. Only users with the analytics role can read the data. |
| App | React. Tables are DTV views over the local Hasura; charts are Apache ECharts. Overview, then a view, then a user. |

## Running it

In the host's repository:

```sh
npx dtv-analytics            # the source named first in dtv.config.ts
npx dtv-analytics --source stage
npx dtv-analytics down
```

The CLI, in Node on the host:

1. Loads `dtv.config.ts` the way `dtv definitions` does, and reads its `analytics` section.
2. Finds every `dtv-migrations/<definition>/index.ts` under the config's `include` patterns,
   and bundles them with esbuild, `@kronor/dtv`'s migration functions included, into
   `.dtv-analytics/definitions.mjs`. Beside it, `definitions.json` lists each definition, its
   current projection and a hash of its chain.
3. Starts the compose project `dtv-analytics-<host>` (server, Postgres, Hasura) with the
   bundle's folder mounted read-only, and the configuration passed in.
4. Opens the app.

The bundle is the only host code the container sees. The host's `node_modules` stays on the
host: finance shares it between macOS and its Linux container, and the native binaries of the
other platform may be missing.

The chains are enough, so the CLI does not load the host's views. With CI checking that every
view change is snapshotted, `chain.latest` is the view as the code has it: its filters and
columns. Running the CLI again rebuilds the bundle; the server sees the changed hashes (see
[Derived rows](#derived-rows)).

### Configuration

```ts
// dtv.config.ts in finance
export default defineConfig({
    // …typegen, definitions
    analytics: {
        sources: {
            prod: {
                type: 'hasura',
                endpoint: 'https://hasura-finance.prod-euw1.booztx.com/v1/graphql',
                role: 'dtv_analytics_query',
                events: { root: 'DtvEvent' },
                userData: { root: 'DTVUserData' },
                users: { root: 'User', id: 'id', name: 'realname' },
            },
            stage: { type: 'hasura', endpoint: '…', role: 'dtv_analytics_query', /* … */ },
        },
    },
});
```

The configuration holds endpoints and names, never secrets. Root and field names are the
host's (finance renames columns to camelCase); the event fields default to the names finance
uses (`eventType`, `occurredAt`, …) and can be mapped one by one.

## The compose project

| Service | |
|---|---|
| `server` | The Haskell server, with Node for the sidecar. Serves the app's files and its own HTTP API. |
| `postgres` | The store, in a named volume per host and source, so data survives restarts. |
| `hasura` | GraphQL over the store for the app, with the package's metadata. |

Everything listens on `127.0.0.1` only. Hasura runs with one role that reads everything:
the data never leaves the machine, and the person who fetched it may read all of it.

The image is built in the monorepo's CI and published with each release of the package, under
the package's version, so the CLI starts the server it was released with.

## Fetching

### Coverage

The server keeps, per source and kind (events, user data), the ranges of `createdAt` it has
fetched completely. A request for a period:

1. subtracts the covered ranges from it, leaving the gaps;
2. fetches each gap, paging through finance's Hasura in the order `(createdAt, id)`,
   10,000 rows a request (finance's limit for the role), continuing after the last row of the
   page before;
3. marks a gap covered once its last page is stored, and merges it with its neighbours.

`createdAt` is when finance stored a row, by the server's clock: a period asked for again
gets the same rows. `occurredAt`, the browser's clock, can be wrong and is not used for this.

A gap is only marked covered up to 10 minutes before now. Finance sets `createdAt` when the
inserting transaction starts, and the row is visible when it commits, so a row can appear
behind rows already read. Rows after that point are stored but stay uncovered, so the next
request fetches them again; the primary key on `id` drops the duplicates.

A fetch that stops halfway (credentials expired, the network) leaves the pages it stored, and
the next request fetches the gap again from the start of the gap.

### Streaming

Each gap is one stream of pages: each page is stored with one `insert … select from unnest(…)
on conflict do nothing` (which drops what was stored before), and its `filtersApplied` go
through the sidecar, before the next page is asked for. Memory holds one page however long the
period is, and a slow store slows the reading instead of piling rows up.

The server decodes only the envelope: the columns `logs.dtv_event` has. `payload` is stored
as it came, as jsonb. A new DTV event needs no change to the server: SQL reads its payload,
and the app shows its type in the counts until a metric uses it.

The app follows a fetch through a `fetch` row the server updates as pages arrive (gap, rows,
pages, state), over a Hasura subscription. Metrics refresh when it is done.

### User data and users

User data is one row per user that changes in place, so it has no periods. The app's Fetch
button fetches it after the events when the stored copy is older than an hour (or there is
none), and the Data page fetches it again on demand. Each fetch stores the rows
whose `revision` changed since the last one, so the store keeps a history of users' settings
from the first fetch on.

Users' names are fetched for the user ids of new events and user data.

## Derived rows

Some of what the metrics need takes DTV's own code, which only runs in TypeScript:

- `filter_use`: one row per filter set in a `filtersApplied`, with its id at the current
  revision of the definition, from `latestFilterId` and `migrateFilterState`. Finance's chains
  have `m.custom` migrations, functions that cannot be read as data.
- `user_view_data`: one row per user and view of the user data, decoded with
  `decodeUserData` and migrated to the current revision, with its saved filters, hidden
  columns, ordering and the rest in columns.

The server streams the events and user data that need it to the sidecar, a Node process
running the bundle, as JSON lines on its standard input, and reads the derived rows from its
output. The store builds each request as JSON and stores each answer from JSON in SQL, so the
server passes them through without knowing DTV's shapes. Each derived row stores the hash of the chain it was made with. When the server
starts and a definition's hash changed, it derives that definition's rows again from the
stored events, without fetching anything.

Everything else is SQL over the stored rows: views and functions in the store, tracked in
Hasura. Instances (time on view, how the view opened, lost events), sessions and the
aggregates are views; the heavy ones are materialized and refreshed after a fetch.

## The store

One store per host and source, so no table names a source:

```
coverage              (kind, ranges): the createdAt ranges fetched completely, a multirange
fetch_job             one row per fetch asked for: period, progress, state, error
event                 the envelope in columns, payload as jsonb, primary key id
user_data             (user_id, revision): user data as fetched, each revision kept
app_user              (id): names
definition            (name, chain_hash, revision, projection) from definitions.json
filter_use            derived, see above
user_view_data        derived, with saved_filter and unreadable_user_data
instance              a view: one row per mounted table
definition_stats      functions of a period, for the app (period_stats, missing_periods too)
```

The server applies the store's schema itself on start, from numbered SQL files in the image.
The store is a copy that can always be fetched again, so a schema change that does not migrate
the data may drop and recreate it.

## Definitions

- Events are grouped by `definition`, not `viewId`: views made per record (`asset-list-7`)
  share a definition and its migrations. A view page lists its view ids when there are several.
- A filter that was dropped since is counted under its old id, marked as removed.
- A definition with no events in the period is unused. One that is in the events but not in
  the bundle is shown as unknown: a view removed since, or a host that did not snapshot it.
- Projections hold ids, not labels, so the app shows filter and column ids.

## Metrics

Events where `impersonatorId` is set are left out by default: a developer looking at a user's
tables is not that user using them. A switch brings them back.

How events are put together follows
[Putting events together](../../dtv/docs/analytics.md#putting-events-together).

### Adoption

- Per definition: users, sessions, mounts, popouts, and the share of the period's active users.
- Time on a view: `viewUnmounted.at - viewMounted.at` per instance. Without a `viewUnmounted`
  (a closed tab can lose it), the instance's last event ends it, and the count says how many
  were cut short.
- How views are reached: `linkSource` for links, and the views menu.
- How users move: `viewSelected.previousViewId` to `viewId`, and the order of a session's
  instances by `viewMounted.at`, as a Sankey chart.
- When: active users, mounts and sessions a day.
- Versions: sessions by `sessionStarted.dtvVersion` and by `appVersion`.

### Filters and settings

- Per filter: how many applications and users set it, at the current revision (`filter_use`).
- Filters used together: the most common sets of filters in one application.
- How filters are applied: triggers and saved filters.
- AI: `aiFilter` outcomes and durations, its prompts, and whether the next `filtersApplied`
  kept what the assistant filled in.
- `filterSearch` queries: what users look for among the filters, including what is not there.
- Saved filters: created, deleted and applied, by `savedFilterId`; share links by `from`.
- Settings changed in the period: `orderingChanged` fields, `rowsPerPageChanged` values,
  `hiddenColumnsChanged`, and how long each panel stays open (`panelShown` to the next one or
  `viewUnmounted`).

### Performance and errors

- `fetch`: `durationMs` per definition by `reason`, as p50, p95 and p99 and as box plots, and
  over time. The slowest filter combinations, through `filtersSeq` to the `filtersApplied` that
  made the request. Outcomes, error kinds and messages, and row counts.
- `userDataLoad`, `action` (per action), `rowExpansionLoad`, `aiFilter`: durations and outcomes.
- Problems: `userDataSaveFailed`, `userDataConflict`, `userDataReadOnly`,
  `filtersChangedSinceSnapshot`, `suggestionsFailed`, per definition and over time.
- Each of these by `appVersion` and DTV version, so a release that made something slower or
  broke it shows.
- Lost events: gaps in an instance's `seq`. A rising rate means the host loses events on the
  way, which makes every other number lower than it is.

### Unused views and filters

- Definitions with no `viewMounted` in the period.
- Filters of the current projection that no `filtersApplied` set in the period, per
  definition, with how often the definition was used, so a filter of a rarely used view is not
  mistaken for a useless one.
- Columns that every user who changed the view's columns hid (`user_view_data`).

A definition reached only by some roles, or added during the period, looks less used than it
is. The view page shows when the definition first appears in the events.

### Users and their stored settings

From `user_view_data`:

- Per user: views with stored data, saved filters (per view, with names), views with their
  filters or ordering kept, hidden columns, custom column order, rows per page, preferences.
- Across users: how many have saved filters and how many each, per view how many changed its
  columns and which columns are hidden most, the share keeping filters between visits.
- Over time, from the history the fetches keep: how settings changed.

User data goes back further than the events: it shows which views people set up before events
were recorded.

## The app

```
/                       Views: the period at a glance, and every definition
/users                  Users: who used the tables, and how much
/saved-filters          Saved filters: what users keep, where, what they set, which are applied
/errors                 Errors: everything that failed, by type, definition and message
/data                   the source: coverage, fetches, event types, user data
/view/:definition       one definition (under Views)
/user/:userId           one user (under Users): what they used, their saved filters, what they keep
```

The period, the app version, the DTV version and the impersonation switch are in the URL
query, shared by all pages, so a link shows what its sender saw. Changing the period asks the
server for it; what is covered shows at once, the rest as it arrives.

- **Overview:** active users, sessions, p95 fetch time and error rate for the period, with
  their trend. A table of definitions with users, mounts, p95, error rate and lost events.
  Unused definitions, and the top users.
- **View:** adoption, then filters and settings, then performance and errors, then the
  definition's users and its unused filters and columns.
- **User:** as above, from the user's events and stored data.

Tables are DTV views over the local Hasura, with their row types from `dtv typegen` against
the store's schema: filtering, sorting, saved filters and links come with them, and the tool
uses DTV the way its users do. Charts read Hasura's aggregates and the store's functions, and
use ECharts (`echarts/core` with only the charts used) for lines, bars, box plots
and the Sankey chart, with zoom on time series. A selection on a time chart sets the period of
the page.

## Credentials

The app opens on a connect form when the source has none: a Hasura JWT and a Cloudflare service
token (client id and secret) or a `CF_Authorization` cookie. The form posts them to the
server, which keeps them in memory only and adds them to its requests to the source, with
`x-hasura-role` set to the configured role.

A JWT lasts 8 hours in finance and carries the roles it was issued with: one issued before
`dtv_analytics_query` was deployed is refused. When the source does not take the credentials
(Cloudflare Access answers with its login page, HTTP 401 or 403, or Hasura's `invalid-jwt` or
`access-denied`), the fetch fails with the reason, the server forgets them, and the form asks
again.

What is stored can be read without credentials; the app says how recent it is.

## The server

- HTTP: `warp`, with `servant` for the app's API (`POST /connect`, `POST /fetch` with a
  period, the app's files).
- Requests to the source: `http-client` with TLS, the response body read as a stream.
- Streaming: `streaming` or `conduit`, decided with the first fetch; both give constant memory
  and resource safety.
- Store: `hasql` and `hasql-transaction`, `COPY` for batches.
- Concurrency: `async` and STM. One fetch per source and kind at a time; a request for a period
  already being fetched waits for it.
- The sidecar: `typed-process`, restarted when it exits; its rows are matched to requests by
  a sequence number, so a crash loses no event, only time.

## What other packages need

- **`@kronor/dtv`:** export `decodeUserData` (user data JSON to undecoded views, with format
  migrations) and `CURRENT_USERDATA_FORMAT_REVISION` from the library. Nothing else: the CLI
  finds the chains by the folder name `dtv definitions` writes them to.
- **finance:** a `dtv-analytics.config.ts`, an `npm run dtv-analytics` script, and
  `.dtv-analytics/` in `.gitignore`.

## Package layout

```
packages/dtv-analytics/
    bin/dtv-analytics.js
    cli/          Node: config, the definitions bundle, compose
    sidecar/      Node: runs the bundle over JSON lines
    server/       Haskell: cabal project
    store/        SQL: the schema, views and functions, applied by the server
    hasura/       metadata for the store
    app/          React: pages, DTV views, charts
    docker/       Dockerfile, compose.yaml
    docs/
```

## Testing

- **Server**, `hspec`: coverage (gaps of a period, merging, the uncovered last minutes), paging
  and resuming against a fake source served by `warp`, duplicates and late rows, a sidecar
  that crashes. Against a Postgres started by the test.
- **Store:** pgTAP for the views and functions, on hand-written events: lost events, old
  revisions, unknown types, impersonation.
- **Sidecar:** Jest, on a bundle of test chains with renames, drops and a custom migration.
- **App:** one Playwright test on a seeded store: the three pages render, a fetch shows its
  progress, and a link reproduces a page.

## Later

- **Signing in with `cloudflared`** instead of pasting a JWT.
- **`viewUnmounted` on `pagehide`** in DTV, so time on a view is not cut short when a tab is
  closed.
- **More sources:** a file source (NDJSON exports) for offline analysis, through the same
  coverage, with the file's period as the range.

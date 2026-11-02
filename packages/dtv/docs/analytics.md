# Analytics

A table can report what happens in it: what users do, how long its requests take, and what
fails. DTV only reports. Storing the events and analysing them is up to the app.

- [Setting up](#setting-up)
- [The envelope](#the-envelope): what every event carries
- [Events](#events): every event and its fields
  - [Lifecycle](#lifecycle): `sessionStarted`, `viewMounted`, `viewUnmounted`, `viewSelected`
  - [Filters](#filters): `filtersApplied`, `filterSearch`
  - [The table](#the-table): `orderingChanged`, `rowsPerPageChanged`, `hiddenColumnsChanged`, `panelShown`, `rowExpansionToggled`
  - [Saved filters and links](#saved-filters-and-links): `savedFilterSaved`, `savedFilterDeleted`, `shareLinkCreated`
  - [Spans](#spans): `fetch`, `userDataLoad`, `action`, `rowExpansionLoad`, `aiFilter`
  - [Problems](#problems): `userDataSaveFailed`, `userDataConflict`, `userDataReadOnly`, `filtersChangedSinceSnapshot`, `suggestionsFailed`
- [Shared types](#shared-types)
- [Order and guarantees](#order-and-guarantees)
- [Putting events together](#putting-events-together)
- [Reading old events](#reading-old-events)
- [What is not reported](#what-is-not-reported)
- [Privacy](#privacy)
- [Compatibility](#compatibility)

## Setting up

```tsx
import { App, type DTVAnalyticsEvent } from '@kronor/dtv';

<App
    analytics={{ onEvent: (event: DTVAnalyticsEvent) => queue.push(event) }}
    …
/>
```

- `onEvent` is called synchronously, as each event happens, as a method of `analytics`, so a
  class instance with an `onEvent` method works as it is.
- Keep it cheap: queue the event and send batches.
- What it throws is logged and otherwise ignored, so analytics can never break a table.
- Without `analytics`, nothing is reported, and tables do no work for it.
- `analytics` may change between renders: each event goes to the handler of the latest one.

A sink that sends batches, and what is left when the page is hidden:

```ts
const queue: DTVAnalyticsEvent[] = [];

function flush(): void {
    const batch = queue.splice(0);
    // keepalive lets the request finish while the page unloads
    if (batch.length > 0) void fetch('/analytics', { method: 'POST', body: JSON.stringify(batch), keepalive: true });
}

setInterval(flush, 10_000);
addEventListener('pagehide', flush);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

const analytics = { onEvent: (event: DTVAnalyticsEvent) => queue.push(event) };
```

Types are exported from `@kronor/dtv`: `DTVAnalytics`, `DTVAnalyticsEvent` (narrow it by
`type`), `DTVAnalyticsEventType`, `DTVAnalyticsEventBase`, `DTVAnalyticsEventPayload`,
`DTVAnalyticsSpan`, and the [shared types](#shared-types).

## The envelope

Every event has these fields besides its own:

| Field | Type | |
|---|---|---|
| `type` | string | Which event it is; see [Events](#events). |
| `sessionId` | string | The page session, a UUID: from when DTV was loaded until the page is loaded again. All tables of the page share it, however many and whenever they mount; moving between pages of a single-page app keeps it. Another tab has another one. |
| `instanceId` | string | One mounted table, a UUID. A popout of it is another one, and so is each table on a page. |
| `seq` | number | Numbers the instance's events from 1, without gaps, in the order they were reported. |
| `at` | number | When the event was reported, in milliseconds since the epoch, by the browser's clock. |
| `viewId` | string | The view the event is of. |
| `definition` | string | The view's definition: the id its [migrations](view-migrations.md) are kept under. Views built per record (`asset-list-7`) share it. Without migrations, the view id. |
| `definitionRevision` | number | The revision of the definition the table runs with; 1 without migrations. Filter states in events are written for it (see [Reading old events](#reading-old-events)). |

Spans, things with a duration, are reported once, when they end, and also have:

| Field | Type | |
|---|---|---|
| `startedAt` | number | When it started, in milliseconds since the epoch. |
| `durationMs` | number | How long it took, in whole milliseconds, measured with `performance.now()`, which a changed clock does not affect. |

A whole event, as `onEvent` receives it:

```json
{
    "sessionId": "9c2d7a41-6b3e-4f8a-a1d5-0e4b7c9f2a63",
    "instanceId": "4b1f0e2c-9a57-4d1e-8f0a-2c6f1d3e7b90",
    "seq": 4,
    "at": 1793875200345,
    "viewId": "journal-list",
    "definition": "journal-list",
    "definitionRevision": 3,
    "type": "fetch",
    "startedAt": 1793875200120,
    "durationMs": 225,
    "reason": "filters",
    "page": 0,
    "rowsPerPage": 50,
    "ordering": { "field": "date", "direction": "DESC" },
    "filtersSeq": 3,
    "outcome": "succeeded",
    "rowCount": 50,
    "hasMore": true
}
```

The examples below show each event's own fields only.

## Events

Fields marked *optional* are left out, not `null`, when they do not apply.

### Lifecycle

#### `sessionStarted`

The page session started. Reported once per session, by the table that reports an event first,
as its first event, before its `viewMounted`.

| Field | Type | |
|---|---|---|
| `dtvVersion` | string | The version of `@kronor/dtv` running; `development` in a build that is not the library's, such as tests. |

```json
{ "type": "sessionStarted", "dtvVersion": "9.5.0" }
```

The version is the same for the whole session, so it is reported here only: an event's
version is its session's.

#### `viewMounted`

The table mounted. The instance's first event, but in the table that starts the session,
where `sessionStarted` comes before it.

| Field | Type | |
|---|---|---|
| `popout` | boolean | The table is the popout of another one. |

```json
{ "type": "viewMounted", "popout": false }
```

#### `viewUnmounted`

The table unmounted: the user left the page, or the app stopped showing it. No fields.
Spans still running then end after it, as `aborted` (see [Order and guarantees](#order-and-guarantees)).

```json
{ "type": "viewUnmounted" }
```

#### `viewSelected`

The user switched views in the views menu (`showViewsMenu`). The event is of the new view;
the table then opens it as it opens any view, with a `filtersApplied`.

| Field | Type | |
|---|---|---|
| `previousViewId` | string | The view left. |

```json
{ "type": "viewSelected", "previousViewId": "payments" }
```

### Filters

#### `filtersApplied`

Filters were applied and rows are requested for them, the table opening with them included.
Every `fetch` names the `filtersApplied` its filters come from (`filtersSeq`), so the filter
state is reported here only, not with every request.

| Field | Type | |
|---|---|---|
| `trigger` | [`FiltersAppliedTrigger`](#filtersappliedtrigger) | What applied them. |
| `filters` | [filter state](#filter-state) | The filters applied. Empty filters are left out: a filter that is not there was not used. |
| `aiAssisted` | boolean | The AI filter assistant filled the draft since filters were last applied. Edits after it keep this; loading a saved filter clears it. Only `submit` and `api` can be AI-assisted. |
| `savedFilter` | `{ id: string; name: string }`, *optional* | The saved filter applied, for `trigger: 'savedFilter'`. `id` is the one `savedFilterSaved` reported. |
| `link` | `{ definitionRevision: number }`, *optional* | For `trigger: 'link'` and `'url'`: the revision of the definition the link was made for. Lower than `definitionRevision`: the link was older than the view, and was migrated. |

The same filters applied again are reported again: re-running a search is worth knowing.

```json
{
    "type": "filtersApplied",
    "trigger": "submit",
    "filters": {
        "status": { "type": "leaf", "value": { "type": "value", "value": ["OPEN"] } },
        "due-date": {
            "type": "and",
            "children": [
                { "type": "leaf", "value": { "type": "value", "value": "2026-10-01T00:00:00.000Z" } },
                { "type": "leaf", "value": { "type": "empty" } }
            ]
        }
    },
    "aiAssisted": false
}
```

#### `filterSearch`

The user searched the view's filters with "Search filters…", reported once typing paused for a
second, or as the table unmounts. A search cleared sooner is not reported.

| Field | Type | |
|---|---|---|
| `query` | string | What was typed, trimmed. |

```json
{ "type": "filterSearch", "query": "due date" }
```

### The table

#### `orderingChanged`

The user sorted by a column, or removed the sorting. Not reported for the sorting a view opens
with: that is on each `fetch`.

| Field | Type | |
|---|---|---|
| `ordering` | [`DataOrdering`](#dataordering) \| `null` | The new sorting; `null` when it was removed. |

```json
{ "type": "orderingChanged", "ordering": { "field": "amount", "direction": "ASC" } }
```

#### `rowsPerPageChanged`

The user picked another number of rows per page. Not reported for the number a view opens
with, nor when another tab changes it: those are on each `fetch`.

| Field | Type | |
|---|---|---|
| `rowsPerPage` | number | The new number. |

```json
{ "type": "rowsPerPageChanged", "rowsPerPage": 100 }
```

#### `hiddenColumnsChanged`

The user changed which columns are hidden, in the preferences.

| Field | Type | |
|---|---|---|
| `hiddenColumns` | string[] | The ids of all columns hidden after the change. |

```json
{ "type": "hiddenColumnsChanged", "hiddenColumns": ["memo", "created-by"] }
```

#### `panelShown`

A panel was shown or hidden.

| Field | Type | |
|---|---|---|
| `panel` | [`DTVAnalyticsPanel`](#dtvanalyticspanel) | Which. |
| `shown` | boolean | Shown, or hidden. |

`filters`, `savedFilters` and `preferences` are shown one at a time: showing another reports
the one hidden first, then the one shown. Typing a filter search shows `filters`. The AI
assistant and the popout are shown independently.

```json
{ "type": "panelShown", "panel": "savedFilters", "shown": true }
```

#### `rowExpansionToggled`

The user expanded or collapsed a row: with the row's toggler, or through a row expansion
renderer's `toggle` or `collapse`. The table's API (`rowExpansion.expandAll`, `collapseAll`)
is not reported.

| Field | Type | |
|---|---|---|
| `expanded` | boolean | Expanded, or collapsed. |

```json
{ "type": "rowExpansionToggled", "expanded": true }
```

### Saved filters and links

#### `savedFilterSaved`

The user saved the filters, as a new saved filter or over an existing one. Reported even when
writing the user's data failed: the saved filter is kept locally, and the failure is a
`userDataSaveFailed` of its own.

| Field | Type | |
|---|---|---|
| `savedFilterId` | string | The saved filter's id, a UUID; `filtersApplied` names it when it is applied. |
| `name` | string | The name the user gave it. |
| `created` | boolean | A new saved filter; `false` when one was overwritten. |
| `filters` | [filter state](#filter-state) | What it holds. |

```json
{
    "type": "savedFilterSaved",
    "savedFilterId": "0f8e6a4c-2d1b-4c3a-9e5f-7a6b8c9d0e1f",
    "name": "Open, this month",
    "created": true,
    "filters": { "status": { "type": "leaf", "value": { "type": "value", "value": ["OPEN"] } } }
}
```

#### `savedFilterDeleted`

The user deleted a saved filter.

| Field | Type | |
|---|---|---|
| `savedFilterId` | string | Which. |

```json
{ "type": "savedFilterDeleted", "savedFilterId": "0f8e6a4c-2d1b-4c3a-9e5f-7a6b8c9d0e1f" }
```

#### `shareLinkCreated`

The user copied a link to filters. Whoever opens it reports a `filtersApplied` with
`trigger: 'link'`.

| Field | Type | |
|---|---|---|
| `from` | `'filterForm'` \| `'savedFilter'` | The filter form's filters, or a saved filter's. |

```json
{ "type": "shareLinkCreated", "from": "filterForm" }
```

### Spans

Spans also have `startedAt` and `durationMs` (see [The envelope](#the-envelope)).

#### `fetch`

A request for the table's rows ended.

| Field | Type | |
|---|---|---|
| `reason` | [`FetchReason`](#fetchreason) | Why the rows were requested. |
| `page` | number | The page index: 0 for the first page. |
| `rowsPerPage` | number | The rows asked for. |
| `ordering` | [`DataOrdering`](#dataordering) \| `null` | The sorting asked for; `null` for the view's own. |
| `filtersSeq` | number \| `null` | The `seq` of the `filtersApplied` event the request's filters come from, in the same instance. `null` only when the handler was set after that event. |
| `outcome` | `'succeeded'` \| `'failed'` \| `'aborted'` | `aborted`: superseded by a newer request (the user changed filters before rows arrived), or the table unmounted. Rows that arrive for an aborted request are discarded. |
| `rowCount` | number, *optional* | When `succeeded`: the rows that arrived. |
| `hasMore` | boolean, *optional* | When `succeeded`: a full page arrived, so there may be a next one. Pages are fetched by cursor, without a total count. |
| `error` | [`FetchErrorInfo`](#fetcherrorinfo), *optional* | When `failed`: what went wrong. |

`durationMs` covers resolving the request headers, the request, and flattening the rows.

```json
{
    "type": "fetch",
    "startedAt": 1793875300000,
    "durationMs": 30012,
    "reason": "nextPage",
    "page": 3,
    "rowsPerPage": 50,
    "ordering": null,
    "filtersSeq": 7,
    "outcome": "failed",
    "error": {
        "kind": "timeout",
        "message": "canceling statement due to statement timeout",
        "status": 200,
        "codes": ["postgres-error"]
    }
}
```

A failed request still shows the table empty, as before analytics; only the event tells it apart
from a request that found no rows.

#### `userDataLoad`

The user's data was loaded and read, once per mounted table: from the app's `userData.onLoad`,
or from localStorage alone without one. Reading includes migrating each view's data to its
definition's current revision.

| Field | Type | |
|---|---|---|
| `outcome` | `'succeeded'` \| `'failed'` | `failed`: the app's loader failed or returned what could not be read. The table goes on with the local copy. |
| `source` | `'remote'` \| `'local'` | The copy the table started from: the loader's, or localStorage's when that was newer, the load failed, or there is no loader. |
| `migrated` | boolean | Migrations changed what is stored. |
| `resets` | [`DTVAnalyticsResets`](#dtvanalyticsresets)[] | Filters whose stored state was dropped while reading: the cost of definition changes to users. Empty when nothing was. |
| `retainedViews` | [`DTVAnalyticsRetainedView`](#dtvanalyticsretainedview)[] | Views of this table whose stored data was left as it was, unread. |
| `error` | [`DTVAnalyticsUserDataError`](#dtvanalyticsuserdataerror), *optional* | When `failed`: why. |

When the stored data is in a format this version cannot read, the table reports
`userDataReadOnly` instead.

```json
{
    "type": "userDataLoad",
    "startedAt": 1793875199900,
    "durationMs": 180,
    "outcome": "succeeded",
    "source": "remote",
    "migrated": true,
    "resets": [{ "viewId": "journal-list", "persistedFilterState": ["amount"], "savedFilters": [{ "name": "Big ones", "filterIds": ["amount"] }] }],
    "retainedViews": []
}
```

#### `action`

An action button's `onClick` ended: its promise settled, or it threw.

| Field | Type | |
|---|---|---|
| `action` | string | The action's `id`, or its label when it has none. Give actions an `id`: labels change with wording. |
| `selectedRows` | number | The rows selected when it was clicked. |
| `outcome` | `'succeeded'` \| `'failed'` | `failed`: it threw or rejected. |
| `error` | [`DTVAnalyticsError`](#dtvanalyticserror), *optional* | When `failed`: what it threw. |

```json
{ "type": "action", "startedAt": 1793875400000, "durationMs": 1200, "action": "csv-export", "selectedRows": 0, "outcome": "succeeded" }
```

#### `rowExpansionLoad`

The data of a lazily expanded row (`rowExpansion.lazy`) was loaded, the first time the row was
expanded. Rows expanded again use what was loaded and report nothing; a row whose data failed
to load is loaded, and reported, again.

| Field | Type | |
|---|---|---|
| `outcome` | `'succeeded'` \| `'failed'` | |
| `error` | [`DTVAnalyticsError`](#dtvanalyticserror), *optional* | When `failed`. |

```json
{ "type": "rowExpansionLoad", "startedAt": 1793875500000, "durationMs": 95, "outcome": "succeeded" }
```

#### `aiFilter`

The AI filter assistant was asked to fill the filters. It fills the draft; applying it is a
`filtersApplied` with `aiAssisted: true`.

| Field | Type | |
|---|---|---|
| `prompt` | string | What the user asked, as typed. |
| `outcome` | `'succeeded'` \| `'failed'` | `succeeded`: it filled the filters. |
| `error` | [`DTVAnalyticsError`](#dtvanalyticserror), *optional* | When `failed`: the provider's error, or that its answer could not be read. |

```json
{ "type": "aiFilter", "startedAt": 1793875600000, "durationMs": 2400, "prompt": "unpaid invoices from october", "outcome": "succeeded" }
```

### Problems

#### `userDataSaveFailed`

Writing the user's data failed: to the app's `userData.onSave`, or to localStorage. The change
is kept in the table, and written again with the next change.

| Field | Type | |
|---|---|---|
| `error` | [`DTVAnalyticsUserDataError`](#dtvanalyticsuserdataerror) | Why. |

```json
{ "type": "userDataSaveFailed", "error": { "kind": "externalSaveFailed", "message": "Stale revision: user data was not updated" } }
```

The `message` of `external…` errors is what the app's callback returned or threw.

#### `userDataConflict`

The app's `onSave` rejected a write because another tab or device wrote first. The table loaded
theirs, applied the change on top, and wrote again.

| Field | Type | |
|---|---|---|
| `resolved` | boolean | Writing again succeeded. When not, a `userDataSaveFailed` follows. |

```json
{ "type": "userDataConflict", "resolved": true }
```

#### `userDataReadOnly`

The stored user data is in a format this version cannot read, e.g. one a newer version wrote in
another tab. The table works from defaults and saves nothing, so the newer data is not lost.

| Field | Type | |
|---|---|---|
| `message` | string | What could not be read. |

```json
{ "type": "userDataReadOnly", "message": "User-data migration cannot proceed from an unknown revision. Current revision: 2027-01-10T00:00:00.000Z …" }
```

#### `filtersChangedSinceSnapshot`

The view's filters differ from its latest definition snapshot: the definition changed and
`dtv definitions snapshot` was not run for it, so no migration covers the change. Reported as
the table opens the view. `dtv definitions check` in CI prevents it; in production it should
never be reported.

| Field | Type | |
|---|---|---|
| `changed` | string[] | Filters in both, defined differently. Their stored state is reset rather than misread. |
| `added` | string[] | Filters only the view has. |
| `removed` | string[] | Filters only the snapshot has. |

```json
{ "type": "filtersChangedSinceSnapshot", "changed": ["amount"], "added": ["currency"], "removed": [] }
```

#### `suggestionsFailed`

A filter's suggestion fetcher (an autocomplete) failed. The filter shows no suggestions. Each
failed lookup is reported, so one broken fetcher can report once per keystroke.

| Field | Type | |
|---|---|---|
| `error` | [`DTVAnalyticsError`](#dtvanalyticserror) | What it threw. |

```json
{ "type": "suggestionsFailed", "error": { "name": "ClientError", "message": "field 'vendors' not found in type: 'query_root'" } }
```

## Shared types

### `FiltersAppliedTrigger`

| Value | The filters were applied by |
|---|---|
| `submit` | Submitting the filter form. |
| `reset` | "Reset All" in the filter form. |
| `pillRemoved` | Removing an applied filter's pill. |
| `savedFilter` | Using a saved filter. |
| `api` | App code: `applyFilters` from a cell renderer, row expansion renderer, no-rows component or action. |
| `link` | The table opening with a link: one shared from a table, or made elsewhere, e.g. by the app. |
| `url` | The table opening with the filter state it keeps in its URL (`syncFilterStateToUrl`): a reload, its popout, or that URL copied from the address bar. |
| `restored` | The table opening with the filter state persisted in the user's data. |
| `initial` | The table opening with the view's initial filter values. |

### `FetchReason`

| Value | The rows were requested because |
|---|---|
| `filters` | Filters were applied; see the `filtersApplied` of `filtersSeq`. The table opening is one. |
| `ordering` | The user sorted. The first page is requested. |
| `rowsPerPage` | The user picked another number of rows per page. The first page is requested. |
| `nextPage`, `previousPage` | The user paged. |
| `refresh` | The app asked for fresh rows (`DTVAPI.fetchData`, an action's `refetch`), e.g. after a mutation. |
| `userData` | The rows per page or the sorting changed in the user's data, e.g. in another tab. |

### `DTVAnalyticsPanel`

`'filters'`, `'savedFilters'`, `'preferences'`, `'aiAssistant'` or `'popout'`.

### `DataOrdering`

```ts
{ field: string; direction: 'ASC' | 'DESC' }
```

`field` is the field the rows are sorted by, as a column's `orderBy` names it, not a column id.

### Filter state

Filter states (`filtersApplied.filters`, `savedFilterSaved.filters`) are written as the user's
data stores them, and as links carry them: by filter id, each filter's state a tree that
follows the shape of its expression.

```ts
type FilterState = Record<FilterId, Node>;

type Node =
    | { type: 'leaf'; value: { type: 'empty' } | { type: 'value'; value: Json } }
    | { type: 'and' | 'or'; children: Node[] }
    | { type: 'not'; child: Node };
```

- A filter that is left empty is not in the state at all.
- A filter with several parts, like a date range, keeps its empty parts: a range with only a
  start has an `empty` end.
- Values are what the filter's control holds: text, a number, a list of dropdown or multiselect
  values, a boolean.
- Dates are ISO 8601 strings.
- A custom operator's value is `{ operator, value }`, where `value` is again `{ type: 'empty' }`
  or `{ type: 'value', value }`. A date in it is still a `Date` until the event is serialized:
  `JSON.stringify` writes it as an ISO string.
- Values are as the control holds them, before a filter's query transforms change them. A filter
  whose transform turns major units into minor ones reports what the user typed.

```json
{
    "customer-email": { "type": "leaf", "value": { "type": "value", "value": "a@example.com" } },
    "status": { "type": "leaf", "value": { "type": "value", "value": ["PAID", "VOID"] } },
    "reference": {
        "type": "leaf",
        "value": { "type": "value", "value": { "operator": "_ilike", "value": { "type": "value", "value": "%INV%" } } }
    },
    "created": {
        "type": "and",
        "children": [
            { "type": "leaf", "value": { "type": "value", "value": "2026-10-01T00:00:00.000Z" } },
            { "type": "leaf", "value": { "type": "empty" } }
        ]
    },
    "not-voided": { "type": "not", "child": { "type": "leaf", "value": { "type": "value", "value": true } } }
}
```

The type is exported as `UndecodedFilterState`.

### `FetchErrorInfo`

```ts
{ kind: FetchErrorKind; message: string; status?: number; codes?: string[] }
```

| `kind` | What failed | Told by |
|---|---|---|
| `timeout` | The database cancelled the query, e.g. on its statement timeout, or a gateway timed out. Narrower filters may help. | HTTP 504, or an error message about a statement timeout or cancelled statement. |
| `unauthorized` | The API rejected the token or the role. | HTTP 401 or 403, or a Hasura code such as `invalid-jwt` or `access-denied`. |
| `graphql` | The API answered with errors, e.g. a field the role may not read. | GraphQL errors in the response. |
| `http` | The API answered with an error status and no GraphQL errors. | Any other HTTP error status. |
| `network` | No answer arrived: offline, DNS, CORS, a dropped connection. | fetch's `TypeError`, in each browser's words. |
| `unexpectedResponse` | The answer has no rows where the view's root field should be. | The response. |
| `internal` | Code failed: the app's `requestHeaders`, building the query's variables, flattening the rows. | Anything else. |

- `message`: the GraphQL errors' messages joined with `; `, `HTTP <status>`, or the error's
  message.
- `status`: the HTTP status, when an answer arrived. A GraphQL error usually comes with 200.
- `codes`: the GraphQL errors' `extensions.code`, when they have one.

### `DTVAnalyticsError`

```ts
{ name: string; message: string }
```

An error's `name` (`TypeError`, `ClientError`, …) and `message`. What is thrown that is not an
`Error` has the name `Error` and itself as the message.

### `DTVAnalyticsResets`

```ts
{
    viewId: string;
    persistedFilterState: string[];                         // filters reset in the filters the view opens with
    savedFilters: { name: string; filterIds: string[] }[];  // filters reset in each saved filter
}
```

### `DTVAnalyticsRetainedView`

```ts
{ viewId: string; reason: 'newerRevision' | 'decodeFailed' }
```

- `newerRevision`: written for a revision of the definition this table does not know yet, by a
  newer version in another tab, or before a rollback.
- `decodeFailed`: it could not be read.

The data is kept as stored, for whoever can read it.

### `DTVAnalyticsUserDataError`

```ts
{ kind: 'externalLoadFailed' | 'externalSaveFailed' | 'localStorageFailed'; message: string }
```

`external…` failures come from the app's `userData.onLoad` and `onSave`; `message` is what
they returned or threw.

## Order and guarantees

- **One session per page load.** Every table of the page has the same `sessionId`, and the
  first to report anything reports `sessionStarted`. Events are numbered per table, not per
  session: order a session's tables by their `viewMounted.at`.
- **One instance per mounted table.** Each `App` has its own `instanceId`, numbering, and user
  data load. Several tables on a page are several instances, and so is a popout. The popout is
  mounted without the app's actions and user data callbacks, so it reports no `action`, and its
  `userDataLoad` reads localStorage alone.
- **`seq` has no gaps.** Within an instance, events are numbered from 1 in the order they were
  reported. A gap means events were lost on the way, not that the table skipped one. Events are
  numbered only while there is a handler: one set after the table mounted starts the
  numbering then.
- **`viewMounted` comes first, `viewUnmounted` last.** The exceptions: `sessionStarted` comes
  before `viewMounted` in the session's first table, and spans that were running as the table
  unmounted end after it, as `aborted`, or as they settle.
- **Filters before requests.** The `filtersApplied` a request's filters come from is reported
  before the request starts, so `filtersSeq` always points back.
- **Spans are reported when they end.** A `fetch` that started before another event can come
  after it.
- **Events as the table unmounts are not lost.** What the table reports while it unmounts is
  reported before `viewUnmounted`, and so is a filter search still waiting for its pause.
- **StrictMode adds nothing.** React's StrictMode mounts tables twice in development builds.
  The table still reports one `viewMounted`, one `userDataLoad`, and `viewUnmounted` only when
  it unmounts.
- **Clocks.** `at` and `startedAt` are the browser's clock, which may be wrong; order events by
  `instanceId` and `seq`, and store the time they arrived beside them. `durationMs` is measured
  with `performance.now()`, which a clock change does not affect. Browsers slow timers in
  background tabs: spans that ran there can be longer than the work took.

## Putting events together

- **A page session:** its events by `sessionId`, each table's by `instanceId` and `seq`: the
  views a user opened, one after another, between two page loads. Its `sessionStarted` says
  which DTV version all of them ran.
- **A table's life:** its events by `instanceId`, ordered by `seq`. Time on the view is
  `viewUnmounted.at - viewMounted.at`.
- **The filters a request ran with:** the `filtersApplied` with the same `instanceId` and
  `seq = fetch.filtersSeq`. Slow and failing filter combinations come out of this.
- **How a view opens:** the first `filtersApplied` after `viewMounted` (or `viewSelected`)
  says where its filters came from, and the `fetch` that names it how long the first rows took.
  `userDataLoad` says how long the user's data took. It can come before or after: a table opens
  from the local copy when that is enough, without waiting for the load.
- **Saved filter use:** `savedFilterSaved` and `savedFilterDeleted` by `savedFilterId`, and the
  `filtersApplied` whose `savedFilter.id` names it.
- **How long a panel was open:** a `panelShown` with `shown: true` and the next one of the same
  panel with `shown: false`, or `viewUnmounted`.
- **AI assistance:** `aiFilter` and the next `filtersApplied` with `aiAssisted: true`, or none
  when the user dropped what the assistant filled in.

## Reading old events

Filter states and filter ids in events are written for the definition revision the table ran
with (`definitionRevision`). When the definition changed since, read them in terms of the
current one with the view's migrations, the chain its `dtv-migrations` folder exports:

```ts
import { currentDefinitionRevision, latestFilterId, migrateFilterState } from '@kronor/dtv';
import journalListMigrations from './dtv-migrations/journal-list';

// A whole filter state, e.g. to see which values users filter by
const filters = migrateFilterState(journalListMigrations, event.definitionRevision, event.filters);

// One filter id, e.g. when counting how often each filter is used: 'amount', or null when dropped
const filterId = latestFilterId(journalListMigrations, event.definitionRevision, 'amt');

// Whether an event is of the current revision
const current = event.definitionRevision === currentDefinitionRevision(journalListMigrations);
```

`latestFilterId` follows renames; a filter that was reset keeps its id, though what was stored
for it may have meant something else. Group events by `definition`, not `viewId`: views built
per record share a definition and its migrations.

## What is not reported

- Editing the draft: typing in the filter form. Only applying it is.
- Selecting rows. `action` reports how many were selected when it ran.
- The "Export page to CSV" button (`showCsvExportButton`).
- The preferences other than hidden columns: syncing filters or sorting to user data, syncing
  filters to the URL, closing the filter panel on apply.
- The table's API: `DTVAPI.rowSelection`, `rowExpansion` (its `fetchData` is a `fetch` with
  `reason: 'refresh'`).
- The sorting, rows per page and filters a view opens with are not changes: they are on the
  `fetch` and the `filtersApplied` it names.

## Privacy

Events carry what users typed and chose: filter values (names, emails, amounts, references),
saved filter names, AI prompts, filter searches, and the error messages of the API, which can
quote values. Treat them as the data the table shows. DTV sends events to the app's handler only;
what is stored, for how long, and who may read it is the app's to decide.

## Compatibility

- New events and new fields may come in minor releases; existing ones keep their meaning.
  Handle event types you do not know, e.g. with a `default` that stores them as they are.
- Optional fields are left out, not `null`, when they do not apply.
- Filter states follow the user data format; links and saved filters use the same one.

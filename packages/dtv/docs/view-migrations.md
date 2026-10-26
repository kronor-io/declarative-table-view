# View migrations

Users' saved filters, their persisted filter state, hidden columns, sorting and shared links are stored
against a view's definition: by filter and column ids, and in the shape of each filter's
expression. When the definition changes, what is stored has to change with it, or it is lost —
or worse, silently means something else (a reordered date range swaps its bounds; a filter now
on minor units keeps a value in major units).

DTV handles this with **view migrations**: each revision of a view definition is committed as a
snapshot, and a migration between two snapshots says what happens to stored data. DTV runs them
when it reads a user's data, and `dtv definitions check` fails CI when a definition changed without one.

## Setup

`dtv definitions` finds the views itself: the modules `scan` in `dtv.config.ts` matches that call
`DTV.view`, and in them the exports that are views or return one. A factory is built with arguments
made up from its parameter types — twice, minimal and contrasting, to see what its arguments change.
What a snapshot records does not depend on labels, initial values or dropdown items, so for most
factories that is all it takes.

1. Snapshot every view:

   ```sh
   npx dtv definitions snapshot
   ```

   This writes a `dtv-migrations/<definition>/` folder (`rev1.snapshot.ts`, `index.ts`) next to each
   view's module, and wires the view up with it:

   ```ts
   import journalListMigrations from './dtv-migrations/journal-list';

   DTV.view({ id: 'journal-list', migrations: journalListMigrations, … })
   ```

   Where it cannot tell which `DTV.view` call is the view's (several calls with computed ids in one
   module), or the module is not known (JSON views), it prints these lines to add instead.

   Once a view imports its migrations, that import is where they are: move the folder anywhere and
   update the import, and `dtv definitions` follows it.

   JSON views reference them from the runtime instead: `"migrations": { "section": "viewMigrations",
   "key": "journal-list" }`, with the chain under `viewMigrations` in the external runtime.

   Later runs write revisions for the views that changed; views without changes are only counted
   (`172 views up to date`).

2. In CI:

   ```sh
   npx dtv definitions check
   ```

### When a factory needs help

`dtv definitions` says which factories it cannot handle alone; configure them in `dtv.config.ts`, by export
name (or `path/to/module.ts#name` when several modules export the name):

```ts
definitions: {
    factories: {
        // Its id is computed from its arguments (`${entityLog}-history-list`): name the definition.
        historyDtvView: { definition: 'history-list' },
        // Its arguments change its filters, or it throws on made-up ones: give the arguments.
        someDialogView: { args: [{ mode: 'dialog', items: [{ id: 1 }] }] },
    },
},
```

A factory whose arguments only add a suffix to its id (`asset-list` → `asset-list-7`) needs nothing:
the id without the suffix is the definition id, and every instance shares its migrations. Columns
that only some arguments add (e.g. an actions column for passed callbacks) all go into the snapshot.

### Loading

The views are loaded through the project's own Vite and Vite config (aliases, styles and `?raw`
imports resolve as in the app), with dependencies bundled for SSR, and with the project's `jsdom` as
browser globals for modules that touch `window` as they load. `dtv.config.ts` is loaded without Vite:
it must not import view modules, and anything it needs only for typegen (a schema secret from the
environment) belongs in `schema` written as a function, which only `dtv typegen` calls.

`definitions` in `dtv.config.ts` also takes `viteConfig` and `migrationsDir` (where migrations go for views
whose module is not found, such as JSON views; default `dtv-migrations`). Options: `--config`,
`--vite-config`, `--migrations-dir`.

## Changing a view

Change the definition, then run `npx dtv definitions snapshot`. For each changed view it writes the next
snapshot and the migration into it (`rev4.snapshot.ts` and `rev4.migration.ts`), and adds the migration
to `index.ts`:

```ts
export default DSL.defineMigration(rev3, rev4, m => [
    // "amt" was removed and "amount" added, with the same definition.
    // If "amount" is another filter that only looks the same: m.drop('amt')
    m.renameFilter('amt', 'amount'),
    m.drop('legacy'),
    // "status": its field changed from "status" to "state".
    // Same meaning: m.keep('status', { because: '…' })
    // Otherwise: m.reset('status')
    m.todo('status', 'its field changed from "status" to "state"; does what is stored still mean the same?'),
    m.resetSort('amount'),
]);
```

What the diff decides alone is written out. Where a person has to decide — which of several
look-alike filters was renamed to which, whether a filter on another field still means the same — it
writes `m.todo(…)` with the candidates in comments. **A `todo` does not type-check and fails
`dtv definitions check`**: replace it with the operation you mean.

| Change | Written |
|---|---|
| Filter or column added; labels, initial values, dropdown items changed | nothing |
| Filter removed | `m.drop(id)` |
| Filter removed and exactly one added with the same definition, matching no other | `m.renameFilter(old, new)` |
| Filters removed and added with the same definition, but not one to one | `m.todo` for each removed one (rename or drop) |
| Filter removed and one added that its stored state fits, after a change | `m.todo` (`custom` rename, or drop) |
| Filter gained/lost parts, or its control changed type | `m.reset(id)` |
| Filter's comparison or field changed | `m.todo` (keep or reset) |
| Custom operators added / removed | `m.mapOperators(id, {})` / `m.todo` (map them) |
| Column removed, none added / some added | `m.dropColumn(id)` / `m.todo` (rename or drop) |
| Column sorts by another field | `m.resetSort(id)` |

### Operations

| Operation | Use when |
|---|---|
| `m.renameFilter(from, to)` | Only the id changed (checked: both have the same definition). |
| `m.keep(id, { because })` | The filter changed, but every stored state still fits and means the same (checked: the state types fit). |
| `m.reset(id)` | Stored state is dropped; the filter starts from its initial value. Users are told. |
| `m.drop(id)` | The filter was removed. |
| `m.mapValues(id, value => …)` | Stored values change, e.g. renamed enum values. Lists are mapped element by element; return `DROP` to remove one. Users are told about removed values. |
| `m.mapOperators(id, { old: 'new' \| null })` | Custom operators were removed (checked: every removed one is mapped). `null` clears what used it; users are told. |
| `m.custom(from, to, state => … \| RESET)` | Anything else; `state` is typed by both snapshots. |
| `m.renameColumn(from, to)`, `m.dropColumn(id)`, `m.resetSort(id)` | Columns. A stored sort by what a dropped column, or one given `resetSort`, sorted by is reset. |

Ids are checked against the snapshots: `m.reset('amount')` does not compile if rev3 has no `amount`.

### Changes the snapshots cannot see

Dropdown items and query transforms are not in snapshots. When stored values need to change for
such a reason — enum values renamed, a transform now reading major instead of minor units — make a
revision by hand:

```sh
npx dtv definitions snapshot journal-list --manual "status values are lower case now"
```

and replace its `todo` with e.g. `m.mapValues('status', value => typeof value === 'string' ? value.toLowerCase() : value)`.

### Renaming a view

```sh
npx dtv definitions snapshot payment-list --renamed-from payments
```

renames the `payments` folder (where it is), points the view's import at it, and adds a revision. Users'
data stored under `payments` is taken over by `payment-list`. Views whose ids are derived from the definition id (`${id}-credit`, …) keep their
own data, which a rename does not move.

## At runtime

When DTV reads a user's data, each view's data is migrated from the revision it was written for to
the view's current one, and written back. Filters reset along the way, or that lost stored values,
are named in a notice.

- Data written for a newer revision than the running app knows (an old tab, a rollback) is left
  untouched.
- If a view's filters differ from its latest snapshot (`dtv definitions snapshot` was not run), an
  error is logged and the stored state of the changed filters is reset rather than misread. Columns
  are not compared at runtime (an instance may show a column only with some arguments); `check` does.
- Shared links carry the view and revision they were made for, and are migrated too.

## Known limits

- Snapshots do not see query transforms or what a custom filter component stores. When either
  changes what a stored value means, make a `--manual` revision; nothing warns you to.
- Data written while a definition without a snapshot was deployed is stamped with the older revision
  but has the newer shape. Running `check` in CI is what prevents that.
- Renaming a definition does not move the data of instances whose ids are derived from it
  (`…-${orderId}`).
- View ids must be unique across all apps that share one user's data.
- Views with an id per record (one per order, say) each store their own data, which grows without bound.

# @kronor/dtv-analytics

Shows how an app's DTV tables are used, from the events DTV reports through `analytics`
(see [Analytics](../dtv/docs/analytics.md)) and the users' stored DTV data: which views and
filters people use, how fast the tables are, what fails, and what nobody uses.

It runs on your machine: a server fetches from your app's Hasura into a local store, and an app
shows the store. Nothing is sent anywhere else. See [the design](docs/design.md).

## Setting up a host

The host stores DTV's events and users' DTV data where a Hasura serves them, and describes it in
`dtv-analytics.config.ts`:

```ts
import { defineConfig } from '@kronor/dtv-analytics';

export default defineConfig({
    sources: {
        prod: {
            endpoint: 'https://hasura.example.com/v1/graphql',
            role: 'dtv_analytics',
            events: { root: 'DtvEvent' },
            userData: { root: 'DTVUserData' },
            users: { root: 'User', id: 'id', name: 'realname' },
        },
    },
});
```

- **`events`**: DTV's envelope, the event's own fields in `payload`, and `id`, `userId` and
  `createdAt` (when the source stored the event: what fetching goes by). `impersonatorId`,
  `route`, `appVersion` and `linkSource` are read when the source has them. Name a field the
  source calls differently in `fields`, and an optional one it does not have as `null`.
- **`userData`**: `userId` and `data`; `revision` and `updatedAt` when the source has them.
- **`users`**: where names are, when the source has them.
- **`headers`** are sent as they are; **`secretHeaders`** name the environment variables to send,
  so that secrets stay out of the file. Credentials of a person (a JWT, Cloudflare) are entered
  in the app.

Definitions are read from the `dtv-migrations` folders `dtv definitions` writes.

## Running it

Docker is needed.

```sh
npx dtv-analytics up                  # the first source; --source <name> for another
npx dtv-analytics down                # --purge also deletes what was fetched
```

The app is at http://localhost:4310 (`--port`), the store's Hasura at port 4311. Choose a
period, press Fetch for the parts not fetched yet, and look. A period fetched once is not
fetched again.

## Developing

```sh
npm run build:image                   # the server's image, dtv-analytics-server:dev
npx dtv-analytics up --image dtv-analytics-server:dev
npm run dev:app                       # the app with hot reload, on port 5180
npm run typegen                       # row types of the app's views, from the running store
npm run test-unit                     # the sidecar's derivations
(cd server && cabal test)             # the server
```

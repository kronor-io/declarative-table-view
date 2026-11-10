-- | The local store: what was fetched from the source, and how far fetches got.
module DtvAnalytics.Store
  ( Store,
    StoreError (..),
    FetchId,
    FetchState (..),
    connect,
    migrate,
    run,
    -- * Events
    eventGaps,
    insertEvents,
    markCovered,
    -- * User data and users
    insertUserData,
    lastUserDataFetch,
    unnamedUserIds,
    insertUsers,
    -- * Fetches
    createFetch,
    startFetch,
    addFetchPage,
    finishFetch,
    abandonFetches,
    -- * Derived rows
    syncDefinitions,
    clearFilterUses,
    appliedFiltersOf,
    filterUsesRequest,
    insertFilterUses,
    clearUserViews,
    underivedUserData,
    userViewDataRequest,
    insertUserViews,
  )
where

import Control.Concurrent (threadDelay)
import Control.Exception (Exception, throwIO)
import Data.Aeson qualified as Aeson
import Data.Foldable (for_)
import Data.Functor.Contravariant ((>$<))
import Data.Int (Int32, Int64)
import Data.List (sort)
import Data.Text (Text)
import Data.Text qualified as Text
import Data.ByteString qualified as ByteString
import Data.Text.Encoding qualified as Text
import Data.Time (UTCTime)
import DtvAnalytics.Event (EventRow (..), UserDataRow (..), UserRow (..))
import Hasql.Connection.Settings qualified as Settings
import Hasql.Decoders qualified as D
import Hasql.Encoders qualified as E
import Hasql.Pool (Pool)
import Hasql.Pool qualified as Pool
import Hasql.Pool.Config qualified as Pool
import Hasql.Session (Session)
import Hasql.Session qualified as Session
import Hasql.Statement (Statement)
import Hasql.Statement qualified as Statement
import System.Directory (listDirectory)
import System.FilePath (takeExtension, (</>))
import System.IO (hPutStrLn, stderr)

newtype Store = Store Pool

newtype StoreError = StoreError Pool.UsageError
  deriving stock (Show)

instance Exception StoreError

type FetchId = Int64

data FetchState = Done | Failed Text

connect :: Text -> IO Store
connect connectionString =
  Store <$> Pool.acquire (Pool.settings [Pool.size 4, Pool.staticConnectionSettings (Settings.connectionString connectionString)])

-- | Runs a session, throwing what went wrong.
run :: Store -> Session a -> IO a
run (Store pool) session = Pool.use pool session >>= either (throwIO . StoreError) pure

-- | Applies the numbered SQL files not applied yet, each in its own transaction. Waits for the
-- store to accept connections first, as it starts beside the server.
migrate :: Store -> FilePath -> IO ()
migrate store folder = do
  waitForStore (30 :: Int)
  run store (Session.script "create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())")
  applied <- run store (Session.statement () appliedMigrations)
  files <- sort . filter ((== ".sql") . takeExtension) <$> listDirectory folder
  for_ [file | file <- files, Text.pack file `notElem` applied] \file -> do
    -- UTF-8 whatever the locale says: a container's is often ASCII
    sql <- Text.decodeUtf8 <$> ByteString.readFile (folder </> file)
    hPutStrLn stderr ("Applying " <> file)
    run store . Session.script $
      "begin;\n" <> sql <> "\ninsert into schema_migration (name) values ('" <> Text.pack file <> "');\ncommit;"
  where
    waitForStore attempts = do
      ready <- Pool.use (let Store pool = store in pool) (Session.script "select 1")
      case ready of
        Right () -> pure ()
        Left err
          | attempts <= 1 -> throwIO (StoreError err)
          | otherwise -> threadDelay 1_000_000 >> waitForStore (attempts - 1)

appliedMigrations :: Statement () [Text]
appliedMigrations =
  Statement.preparable "select name from schema_migration" E.noParams (D.rowList (D.column (D.nonNullable D.text)))

-- | The parts of a period whose events were not all fetched yet.
eventGaps :: Statement (UTCTime, UTCTime) [(UTCTime, UTCTime)]
eventGaps =
  Statement.preparable
    "select lower(gap), upper(gap) \
    \from coverage, unnest(tstzmultirange(tstzrange($1, $2)) - coverage.ranges) as gap \
    \where coverage.kind = 'events' \
    \order by 1"
    period
    (D.rowList ((,) <$> D.column (D.nonNullable D.timestamptz) <*> D.column (D.nonNullable D.timestamptz)))

markCovered :: Statement (UTCTime, UTCTime) ()
markCovered =
  Statement.preparable
    "update coverage set ranges = ranges + tstzmultirange(tstzrange($1, $2)) where kind = 'events'"
    period
    D.noResult

period :: E.Params (UTCTime, UTCTime)
period = (fst >$< E.param (E.nonNullable E.timestamptz)) <> (snd >$< E.param (E.nonNullable E.timestamptz))

-- | Stores a page of events, leaving out those stored already. Returns how many were new.
insertEvents :: Statement [EventRow] Int64
insertEvents =
  Statement.preparable
    "insert into event (id, instance_id, session_id, user_id, impersonator_id, created_at, occurred_at, seq, \
    \definition_revision, event_type, view_id, definition, route, app_version, link_source, payload) \
    \select * from unnest($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) \
    \on conflict (id) do nothing"
    ( mconcat
        [ map (.eventId) >$< array E.int8,
          map (.instanceId) >$< array E.uuid,
          map (.sessionId) >$< array E.uuid,
          map (.userId) >$< array E.int8,
          map (.impersonatorId) >$< nullableArray E.int8,
          map (.createdAt) >$< array E.timestamptz,
          map (.occurredAt) >$< array E.timestamptz,
          map (.eventSeq) >$< array E.int4,
          map (.definitionRevision) >$< array E.int4,
          map (.eventType) >$< array E.text,
          map (.viewId) >$< array E.text,
          map (.definition) >$< array E.text,
          map (.route) >$< nullableArray E.text,
          map (.appVersion) >$< nullableArray E.text,
          map (.linkSource) >$< nullableArray E.text,
          map (.payload) >$< array E.jsonb
        ]
    )
    D.rowsAffected

-- | Stores the user data rows whose revision is new.
insertUserData :: Statement [UserDataRow] Int64
insertUserData =
  Statement.preparable
    "insert into user_data (user_id, revision, updated_at, data, fetched_at) \
    \select *, now() from unnest($1, $2, $3, $4) \
    \on conflict (user_id, revision) do nothing"
    ( mconcat
        [ map (.userId) >$< array E.int8,
          map (.revision) >$< array E.int8,
          map (.updatedAt) >$< nullableArray E.timestamptz,
          map (.userData) >$< array E.jsonb
        ]
    )
    D.rowsAffected

-- | When user data was last fetched completely.
lastUserDataFetch :: Statement () (Maybe (FetchId, UTCTime))
lastUserDataFetch =
  Statement.preparable
    "select id, finished_at from fetch_job where kind = 'userData' and state = 'done' order by finished_at desc limit 1"
    E.noParams
    (D.rowMaybe ((,) <$> D.column (D.nonNullable D.int8) <*> D.column (D.nonNullable D.timestamptz)))

-- | The users in events and user data without a name.
unnamedUserIds :: Statement () [Int64]
unnamedUserIds =
  Statement.preparable
    "select id from ( \
    \    select user_id as id from event \
    \    union select impersonator_id from event where impersonator_id is not null \
    \    union select user_id from user_data \
    \) as users \
    \where not exists (select from app_user where app_user.id = users.id) \
    \order by id"
    E.noParams
    (D.rowList (D.column (D.nonNullable D.int8)))

insertUsers :: Statement [UserRow] ()
insertUsers =
  Statement.preparable
    "insert into app_user (id, name) select * from unnest($1, $2) \
    \on conflict (id) do update set name = excluded.name"
    ((map (.userId) >$< array E.int8) <> (map (.name) >$< array E.text))
    D.noResult

-- | A fetch asked for, of events in a period or of user data.
createFetch :: Statement (Text, Maybe (UTCTime, UTCTime)) FetchId
createFetch =
  Statement.preparable
    "insert into fetch_job (kind, period) values ($1, case when $2::timestamptz is null then null else tstzrange($2, $3) end) returning id"
    ( (fst >$< E.param (E.nonNullable E.text))
        <> (fmap fst . snd >$< E.param (E.nullable E.timestamptz))
        <> (fmap snd . snd >$< E.param (E.nullable E.timestamptz))
    )
    (D.singleRow (D.column (D.nonNullable D.int8)))

startFetch :: Statement FetchId ()
startFetch =
  Statement.preparable
    "update fetch_job set state = 'running', started_at = now() where id = $1"
    (E.param (E.nonNullable E.int8))
    D.noResult

-- | Counts a page stored by a fetch, and the rows in it.
addFetchPage :: Statement (FetchId, Int32) ()
addFetchPage =
  Statement.preparable
    "update fetch_job set pages = pages + 1, rows = rows + $2 where id = $1"
    ((fst >$< E.param (E.nonNullable E.int8)) <> (snd >$< E.param (E.nonNullable E.int4)))
    D.noResult

finishFetch :: Statement (FetchId, FetchState) ()
finishFetch =
  Statement.preparable
    "update fetch_job set state = $2, error = $3, finished_at = now() where id = $1"
    ( (fst >$< E.param (E.nonNullable E.int8))
        <> (stateName . snd >$< E.param (E.nonNullable E.text))
        <> (stateError . snd >$< E.param (E.nullable E.text))
    )
    D.noResult
  where
    stateName = \case Done -> "done"; Failed _ -> "failed"
    stateError = \case Done -> Nothing; Failed err -> Just err

-- | Fails the fetches a server stopped before finishing: nothing works on them any more.
abandonFetches :: Statement () ()
abandonFetches =
  Statement.preparable
    "update fetch_job set state = 'failed', error = 'The server stopped', finished_at = now() where state in ('queued', 'running')"
    E.noParams
    D.noResult

-- | Stores the definitions of the CLI's manifest, and removes those it no longer has. Returns
-- the definitions whose chain changed, came or went.
syncDefinitions :: Statement Aeson.Value [Text]
syncDefinitions =
  Statement.preparable
    "with manifest as ( \
    \    select * from jsonb_to_recordset($1) as m (definition text, revision integer, hash text, projection jsonb) \
    \), \
    \changed as ( \
    \    select m.definition as name from manifest as m left join definition as d on d.name = m.definition \
    \    where d.chain_hash is distinct from m.hash \
    \    union \
    \    select d.name from definition as d where not exists (select from manifest as m where m.definition = d.name) \
    \), \
    \removed as ( \
    \    delete from definition as d where not exists (select from manifest as m where m.definition = d.name) \
    \), \
    \stored as ( \
    \    insert into definition (name, revision, chain_hash, projection) \
    \    select definition, revision, hash, projection from manifest \
    \    on conflict (name) do update \
    \    set revision = excluded.revision, chain_hash = excluded.chain_hash, projection = excluded.projection \
    \) \
    \select name from changed"
    (E.param (E.nonNullable E.jsonb))
    (D.rowList (D.column (D.nonNullable D.text)))

clearFilterUses :: Statement [Text] ()
clearFilterUses =
  Statement.preparable
    "delete from filter_use using event where event.id = filter_use.event_id and event.definition = any($1)"
    (array E.text)
    D.noResult

-- | The @filtersApplied@ events of the given definitions.
appliedFiltersOf :: Statement [Text] [Int64]
appliedFiltersOf =
  Statement.preparable
    "select id from event where event_type = 'filtersApplied' and definition = any($1) order by id"
    (array E.text)
    (D.rowList (D.column (D.nonNullable D.int8)))

-- | The sidecar's request for the filters set in those of the given events that are
-- @filtersApplied@.
filterUsesRequest :: Statement [Int64] Aeson.Value
filterUsesRequest =
  Statement.preparable
    "select jsonb_build_object('op', 'filterUses', 'events', coalesce(jsonb_agg(jsonb_build_object( \
    \    'eventId', id::text, \
    \    'definition', definition, \
    \    'definitionRevision', definition_revision, \
    \    'filters', coalesce(payload -> 'filters', '{}') \
    \)), '[]')) \
    \from event where id = any($1) and event_type = 'filtersApplied'"
    (array E.int8)
    (D.singleRow (D.column (D.nonNullable D.jsonb)))

-- | Stores the sidecar's answer to 'filterUsesRequest', with the chain it was derived with.
insertFilterUses :: Statement Aeson.Value ()
insertFilterUses =
  Statement.preparable
    "insert into filter_use (event_id, chain_hash, filter_id, removed) \
    \select (r ->> 'eventId')::bigint, d.chain_hash, r ->> 'filterId', (r ->> 'removed')::boolean \
    \from jsonb_array_elements($1 -> 'rows') as r \
    \join event as e on e.id = (r ->> 'eventId')::bigint \
    \left join definition as d on d.name = e.definition \
    \on conflict do nothing"
    (E.param (E.nonNullable E.jsonb))
    D.noResult

clearUserViews :: Statement () ()
clearUserViews =
  Statement.preparable
    "with cleared as (delete from user_view_data) delete from unreadable_user_data"
    E.noParams
    D.noResult

-- | The revisions of user data that were not derived yet. A revision without views is
-- derived again each time: it has nothing to keep.
underivedUserData :: Statement () [(Int64, Int64)]
underivedUserData =
  Statement.preparable
    "select user_id, revision from user_data as u \
    \where not exists (select from user_view_data as v where v.user_id = u.user_id and v.revision = u.revision) \
    \and not exists (select from unreadable_user_data as x where x.user_id = u.user_id and x.revision = u.revision) \
    \order by user_id, revision"
    E.noParams
    (D.rowList ((,) <$> D.column (D.nonNullable D.int8) <*> D.column (D.nonNullable D.int8)))

-- | The sidecar's request for the given revisions of user data. A view's definition is its id,
-- or the one events of the view name: views built per record share a definition.
userViewDataRequest :: Statement [(Int64, Int64)] Aeson.Value
userViewDataRequest =
  Statement.preparable
    "select jsonb_build_object( \
    \    'op', 'userViewData', \
    \    'viewDefinitions', coalesce(( \
    \        select jsonb_object_agg(view_id, definition) from ( \
    \            select distinct on (view_id) view_id, definition from event \
    \            where view_id <> definition order by view_id, created_at desc \
    \        ) as views \
    \    ), '{}'), \
    \    'users', coalesce(jsonb_agg(jsonb_build_object('userId', u.user_id::text, 'revision', u.revision::text, 'data', u.data)), '[]') \
    \) \
    \from user_data as u \
    \join unnest($1, $2) as k (user_id, revision) on k.user_id = u.user_id and k.revision = u.revision"
    ((map fst >$< array E.int8) <> (map snd >$< array E.int8))
    (D.singleRow (D.column (D.nonNullable D.jsonb)))

-- | Stores the sidecar's answer to 'userViewDataRequest'.
insertUserViews :: Statement Aeson.Value ()
insertUserViews =
  Statement.preparable
    "with views as (select v from jsonb_array_elements($1 -> 'views') as v), \
    \stored_views as ( \
    \    insert into user_view_data (user_id, revision, definition_revision, rows_per_page, keeps_ordering, keeps_filters, \
    \        view_id, definition, chain_hash, ordering, hidden_columns, column_order, kept_filters) \
    \    select (v ->> 'userId')::bigint, (v ->> 'revision')::bigint, (v ->> 'definitionRevision')::integer, \
    \        (v ->> 'rowsPerPage')::integer, (v ->> 'keepsOrdering')::boolean, (v ->> 'keepsFilters')::boolean, \
    \        v ->> 'viewId', v ->> 'definition', d.chain_hash, nullif(v -> 'ordering', 'null'), \
    \        array(select jsonb_array_elements_text(v -> 'hiddenColumns')), \
    \        case when jsonb_typeof(v -> 'columnOrder') = 'array' then array(select jsonb_array_elements_text(v -> 'columnOrder')) end, \
    \        array(select jsonb_array_elements_text(v -> 'keptFilters')) \
    \    from views left join definition as d on d.name = v ->> 'definition' \
    \    on conflict do nothing \
    \), \
    \stored_saved_filters as ( \
    \    insert into saved_filter (user_id, revision, created_at, view_id, id, name, filters) \
    \    select (v ->> 'userId')::bigint, (v ->> 'revision')::bigint, (s ->> 'createdAt')::timestamptz, v ->> 'viewId', \
    \        s ->> 'id', s ->> 'name', array(select jsonb_array_elements_text(s -> 'filters')) \
    \    from views, jsonb_array_elements(v -> 'savedFilters') as s \
    \    on conflict do nothing \
    \) \
    \insert into unreadable_user_data (user_id, revision, error) \
    \select (u ->> 'userId')::bigint, (u ->> 'revision')::bigint, u ->> 'error' \
    \from jsonb_array_elements($1 -> 'unreadable') as u \
    \on conflict do nothing"
    (E.param (E.nonNullable E.jsonb))
    D.noResult

array :: E.Value a -> E.Params [a]
array = E.param . E.nonNullable . E.foldableArray . E.nonNullable

nullableArray :: E.Value a -> E.Params [Maybe a]
nullableArray = E.param . E.nonNullable . E.foldableArray . E.nullable

-- | Fetching from the source into the store, one fetch at a time, in the order asked for.
-- One at a time, so that a period asked for twice is fetched once: the second request finds
-- it covered.
module DtvAnalytics.Fetch
  ( Fetcher,
    newFetcher,
    runFetcher,
    requestEvents,
    requestUserData,
  )
where

import Control.Concurrent.STM (TQueue, atomically, newTQueueIO, readTQueue, writeTQueue)
import Control.Exception (SomeException (..), displayException, try)
import Control.Monad (forever, when)
import Data.Foldable (for_)
import Data.Int (Int64)
import Data.List (unfoldr)
import Data.Maybe (isJust)
import Data.Text qualified as Text
import Data.Time (NominalDiffTime, UTCTime, addUTCTime, diffUTCTime, getCurrentTime)
import DtvAnalytics.Config (Config (..), Source (..))
import DtvAnalytics.Derive (deriveFilterUses, deriveUserViews)
import DtvAnalytics.Event (EventRow (..))
import DtvAnalytics.Sidecar (Sidecar)
import DtvAnalytics.Source (Client, eventPages, fetchUsers, userDataPages)
import DtvAnalytics.Store (FetchId, FetchState (..), Store)
import DtvAnalytics.Store qualified as Store
import Hasql.Session qualified as Session
import Streaming.Prelude qualified as S
import System.IO (hPutStrLn, stderr)

data Fetcher = Fetcher
  { config :: Config,
    client :: Client,
    store :: Store,
    -- | Derives what takes DTV's code, when there is one.
    sidecar :: Maybe Sidecar,
    queue :: TQueue Job
  }

data Job
  = Events FetchId UTCTime UTCTime
  | UserData FetchId

newFetcher :: Config -> Client -> Store -> Maybe Sidecar -> IO Fetcher
newFetcher config client store sidecar = do
  Store.run store (Session.statement () Store.abandonFetches)
  Fetcher config client store sidecar <$> newTQueueIO

-- | Works through the fetches asked for, until the server stops.
runFetcher :: Fetcher -> IO ()
runFetcher fetcher = forever do
  job <- atomically (readTQueue fetcher.queue)
  let fetchId = case job of Events i _ _ -> i; UserData i -> i
  statement fetchId Store.startFetch
  result <- try @SomeException case job of
    Events _ from to -> fetchEvents fetcher fetchId from to
    UserData _ -> fetchUserData fetcher fetchId
  case result of
    Right () -> statement (fetchId, Done) Store.finishFetch
    -- The exception itself: from GHC 9.10 that of SomeException adds a backtrace
    Left (SomeException err) -> do
      hPutStrLn stderr ("Fetch " <> show fetchId <> " failed: " <> displayException err)
      statement (fetchId, Failed (Text.pack (displayException err))) Store.finishFetch
  where
    statement params = Store.run fetcher.store . Session.statement params

-- | Asks for the events stored from @from@ until before @to@.
requestEvents :: Fetcher -> UTCTime -> UTCTime -> IO FetchId
requestEvents fetcher from to = do
  fetchId <- Store.run fetcher.store (Session.statement ("events", Just (from, to)) Store.createFetch)
  atomically (writeTQueue fetcher.queue (Events fetchId from to))
  pure fetchId

-- | Asks for users' stored data, unless it was fetched less than @maxAge@ ago: then the fetch
-- that did is the answer.
requestUserData :: Fetcher -> NominalDiffTime -> IO FetchId
requestUserData fetcher maxAge = do
  now <- getCurrentTime
  latest <- Store.run fetcher.store (Session.statement () Store.lastUserDataFetch)
  case latest of
    Just (fetchId, finishedAt) | diffUTCTime now finishedAt < maxAge -> pure fetchId
    _ -> do
      fetchId <- Store.run fetcher.store (Session.statement ("userData", Nothing) Store.createFetch)
      atomically (writeTQueue fetcher.queue (UserData fetchId))
      pure fetchId

-- | Fetches the parts of the period not covered yet. A gap is covered up to the settle time
-- before the fetch started: rows stored after that may still become visible behind the
-- rows read, so they are fetched again next time, and dropped as duplicates.
fetchEvents :: Fetcher -> FetchId -> UTCTime -> UTCTime -> IO ()
fetchEvents fetcher fetchId from to = do
  started <- getCurrentTime
  let settled = addUTCTime (negate fetcher.config.settle) started
  gaps <- statement (from, to) Store.eventGaps
  for_ gaps \(gapFrom, gapTo) -> do
    S.mapM_
      ( \page -> do
          _ <- statement page Store.insertEvents
          for_ fetcher.sidecar \sidecar -> deriveFilterUses fetcher.store sidecar (map (.eventId) page)
          statement (fetchId, fromIntegral (length page)) Store.addFetchPage
      )
      (eventPages fetcher.client gapFrom gapTo)
    let coveredTo = min gapTo settled
    when (coveredTo > gapFrom) do
      statement (gapFrom, coveredTo) Store.markCovered
  nameUsers fetcher
  where
    statement params = Store.run fetcher.store . Session.statement params

fetchUserData :: Fetcher -> FetchId -> IO ()
fetchUserData fetcher fetchId = do
  S.mapM_
    ( \page -> do
        _ <- statement page Store.insertUserData
        statement (fetchId, fromIntegral (length page)) Store.addFetchPage
    )
    (userDataPages fetcher.client)
  for_ fetcher.sidecar (deriveUserViews fetcher.store)
  nameUsers fetcher
  where
    statement params = Store.run fetcher.store . Session.statement params

-- | Fetches the names of the users that have none yet, when the source has names.
nameUsers :: Fetcher -> IO ()
nameUsers fetcher = when (isJust fetcher.config.source.users) do
  ids <- Store.run fetcher.store (Session.statement () Store.unnamedUserIds)
  for_ (chunks 500 ids) \chunk -> do
    users <- fetchUsers fetcher.client chunk
    Store.run fetcher.store (Session.statement users Store.insertUsers)

chunks :: Int -> [Int64] -> [[Int64]]
chunks size = unfoldr \xs -> if null xs then Nothing else Just (splitAt size xs)

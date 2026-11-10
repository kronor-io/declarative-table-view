-- | What the store keeps beside what was fetched, derived with DTV's code through the sidecar:
-- the filters of each application at the current revision of its definition, and users'
-- stored data per view. The requests and answers are JSON the store builds and reads itself.
module DtvAnalytics.Derive
  ( syncDefinitions,
    deriveFilterUses,
    deriveUserViews,
  )
where

import Control.Monad (unless)
import Data.Aeson qualified as Aeson
import Data.Foldable (for_)
import Data.Int (Int64)
import Data.List (unfoldr)
import DtvAnalytics.Sidecar (Sidecar, ask)
import DtvAnalytics.Store (Store)
import DtvAnalytics.Store qualified as Store
import Hasql.Session qualified as Session
import System.IO (hPutStrLn, stderr)

-- | Stores the host's definitions from the manifest, and derives again what was derived with
-- a chain that changed, or for a definition that came or went.
syncDefinitions :: Store -> Sidecar -> FilePath -> IO ()
syncDefinitions store sidecar manifestFile = do
  manifest <- Aeson.eitherDecodeFileStrict manifestFile >>= either fail pure
  changed <- Store.run store (Session.statement manifest Store.syncDefinitions)
  unless (null changed) do
    hPutStrLn stderr ("Deriving again for " <> show (length changed) <> " changed definitions")
    Store.run store (Session.statement changed Store.clearFilterUses)
    ids <- Store.run store (Session.statement changed Store.appliedFiltersOf)
    for_ (chunks 2000 ids) (deriveFilterUses store sidecar)
    Store.run store (Session.statement () Store.clearUserViews)
  deriveUserViews store sidecar

-- | The filters set in the given events, those that are @filtersApplied@.
deriveFilterUses :: Store -> Sidecar -> [Int64] -> IO ()
deriveFilterUses store sidecar ids = do
  request <- Store.run store (Session.statement ids Store.filterUsesRequest)
  answer <- ask sidecar request
  Store.run store (Session.statement answer Store.insertFilterUses)

-- | Users' stored data per view, for the revisions not derived yet.
deriveUserViews :: Store -> Sidecar -> IO ()
deriveUserViews store sidecar = do
  keys <- Store.run store (Session.statement () Store.underivedUserData)
  for_ (chunks 100 keys) \chunk -> do
    request <- Store.run store (Session.statement chunk Store.userViewDataRequest)
    answer <- ask sidecar request
    Store.run store (Session.statement answer Store.insertUserViews)

chunks :: Int -> [a] -> [[a]]
chunks size = unfoldr \xs -> if null xs then Nothing else Just (splitAt size xs)

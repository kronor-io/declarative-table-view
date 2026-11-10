module Main (main) where

import Control.Concurrent.Async (withAsync)
import DtvAnalytics.Api (application)
import DtvAnalytics.Config (Config (..), loadConfig)
import DtvAnalytics.Derive (syncDefinitions)
import Data.Foldable (for_)
import DtvAnalytics.Fetch (newFetcher, runFetcher)
import DtvAnalytics.Hasura (applyMetadata)
import DtvAnalytics.Sidecar (withSidecar)
import DtvAnalytics.Source (newClient)
import DtvAnalytics.Store qualified as Store
import Network.Wai.Handler.Warp qualified as Warp
import System.Environment (getArgs)
import System.Exit (exitFailure)
import System.IO (BufferMode (..), hPutStrLn, hSetBuffering, stderr)

main :: IO ()
main = do
  hSetBuffering stderr LineBuffering
  file <-
    getArgs >>= \case
      [file] -> pure file
      _ -> pure "/config/config.json"
  config <-
    loadConfig file >>= \case
      Right config -> pure config
      Left err -> hPutStrLn stderr ("Cannot read " <> file <> ": " <> err) >> exitFailure
  store <- Store.connect config.store
  Store.migrate store config.migrations
  for_ config.storeHasura applyMetadata
  client <- newClient config.source
  withOptionalSidecar config.sidecar \sidecar -> do
    case (sidecar, config.definitions) of
      (Just s, Just manifest) -> syncDefinitions store s manifest
      _ -> hPutStrLn stderr "No sidecar or definitions: filters and user data are not derived"
    fetcher <- newFetcher config client store sidecar
    withAsync (runFetcher fetcher) \_ -> do
      hPutStrLn stderr ("Listening on port " <> show config.port)
      Warp.run config.port (application client fetcher config.appHasura config.app)
  where
    withOptionalSidecar = \case
      Just (command : args) -> \action -> withSidecar command args (action . Just)
      _ -> \action -> action Nothing

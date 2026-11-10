-- | The store's own Hasura, which serves it to the app: its metadata is the package's, set by
-- the server once the store has the tables it names.
module DtvAnalytics.Hasura
  ( applyMetadata,
  )
where

import Control.Concurrent (threadDelay)
import Control.Exception (SomeException, try)
import Control.Monad (unless)
import Data.Aeson qualified as Aeson
import Data.ByteString.Lazy qualified as LazyByteString
import Data.Text qualified as Text
import Data.Text.Encoding qualified as Text
import DtvAnalytics.Config (StoreHasura (..))
import Network.HTTP.Client qualified as Http
import Network.HTTP.Types (statusCode)
import System.Environment (lookupEnv)
import System.IO (hPutStrLn, stderr)

-- | Replaces the Hasura's metadata with the package's. Waits for the Hasura to start, as it
-- starts beside the server.
applyMetadata :: StoreHasura -> IO ()
applyMetadata hasura = do
  metadata <- Aeson.eitherDecodeFileStrict @Aeson.Value hasura.metadata >>= either fail pure
  -- Its own variable: a source may name HASURA_GRAPHQL_ADMIN_SECRET for its own Hasura
  secret <- lookupEnv "DTV_ANALYTICS_STORE_SECRET"
  manager <- Http.newManager Http.defaultManagerSettings
  request <- Http.parseRequest (hasura.endpoint <> "/v1/metadata")
  let body = Aeson.encode (Aeson.object ["type" Aeson..= ("replace_metadata" :: Text.Text), "args" Aeson..= metadata])
      request' =
        request
          { Http.method = "POST",
            Http.requestHeaders = ("content-type", "application/json") : [("x-hasura-admin-secret", Text.encodeUtf8 (Text.pack s)) | Just s <- [secret]],
            Http.requestBody = Http.RequestBodyLBS body
          }
      attempt :: Int -> IO ()
      attempt n = do
        result <- try @SomeException (Http.httpLbs request' manager)
        case result of
          Right response | statusCode (Http.responseStatus response) == 200 -> hPutStrLn stderr "Applied the store's Hasura metadata"
          Right response | n <= 1 -> fail ("Hasura refused the metadata: " <> show (LazyByteString.take 500 (Http.responseBody response)))
          Left err | n <= 1 -> fail ("Cannot reach Hasura: " <> show err)
          _ -> threadDelay 1_000_000 >> attempt (n - 1)
  unless (null hasura.endpoint) (attempt 60)

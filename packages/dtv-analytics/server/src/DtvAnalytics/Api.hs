-- | The server's HTTP API, for the app: entering credentials and asking for fetches. What was
-- fetched, and how far a fetch got, the app reads from the store through Hasura.
module DtvAnalytics.Api
  ( application,
  )
where

import Control.Monad (when)
import Control.Monad.IO.Class (liftIO)
import Data.Aeson ((.:), (.:?), (.=))
import Data.Aeson qualified as Aeson
import Data.Text (Text)
import Data.Text qualified as Text
import Data.Time (UTCTime)
import DtvAnalytics.Config (Source (..))
import DtvAnalytics.Fetch (Fetcher, requestEvents, requestUserData)
import DtvAnalytics.Source (Client, Credentials, clientSource, hasCredentials, setCredentials)
import DtvAnalytics.Store (FetchId)
import Network.HTTP.Types (status404)
import Network.Wai (responseLBS)
import Network.Wai.Application.Static (defaultWebAppSettings, ssLookupFile, staticApp)
import Servant
import WaiAppStatic.Types (LookupResult (..), unsafeToPiece)

type Api =
  "api"
    :> ( "source" :> Get '[JSON] SourceInfo
           :<|> "connect" :> ReqBody '[JSON] Credentials :> PostNoContent
           :<|> "fetch" :> "events" :> ReqBody '[JSON] PeriodRequest :> Post '[JSON] FetchCreated
           :<|> "fetch" :> "user-data" :> ReqBody '[JSON] UserDataRequest :> Post '[JSON] FetchCreated
       )
    :<|> Raw

data SourceInfo = SourceInfo
  { name :: Text,
    endpoint :: Text,
    -- | Whether the server can make requests to the source, or needs credentials first.
    connected :: Bool,
    -- | Where the app reads the store.
    store :: Maybe Text
  }

instance Aeson.ToJSON SourceInfo where
  toJSON SourceInfo {..} = Aeson.object ["name" .= name, "endpoint" .= endpoint, "connected" .= connected, "store" .= store]

-- | Events stored from @from@ until before @to@.
data PeriodRequest = PeriodRequest
  { from :: UTCTime,
    to :: UTCTime
  }

instance Aeson.FromJSON PeriodRequest where
  parseJSON = Aeson.withObject "PeriodRequest" \o -> PeriodRequest <$> o .: "from" <*> o .: "to"

newtype UserDataRequest = UserDataRequest
  { -- | User data fetched less long ago is not fetched again.
    maxAgeSeconds :: Maybe Int
  }

instance Aeson.FromJSON UserDataRequest where
  parseJSON = Aeson.withObject "UserDataRequest" \o -> UserDataRequest <$> o .:? "maxAgeSeconds"

newtype FetchCreated = FetchCreated FetchId

instance Aeson.ToJSON FetchCreated where
  toJSON (FetchCreated fetchId) = Aeson.object ["fetchId" .= fetchId]

-- | The API, and the app's files when there are any: a path that is not a file is the app's
-- own route, so it gets the app's page.
application :: Client -> Fetcher -> Maybe Text -> Maybe FilePath -> Application
application client fetcher appHasura appFiles =
  serve (Proxy @Api) ((source :<|> connect :<|> fetchEvents :<|> fetchUserData) :<|> files)
  where
    source = liftIO do
      let s = clientSource client
      connected <- hasCredentials client
      pure (SourceInfo s.name (Text.pack s.endpoint) connected appHasura)
    connect credentials = liftIO (setCredentials client credentials) >> pure NoContent
    fetchEvents PeriodRequest {..} = do
      when (from >= to) do
        throwError err400 {errBody = "The period has to start before it ends"}
      FetchCreated <$> liftIO (requestEvents fetcher from to)
    fetchUserData UserDataRequest {..} =
      FetchCreated <$> liftIO (requestUserData fetcher (maybe 3600 fromIntegral maxAgeSeconds))
    files = case appFiles of
      Nothing -> Tagged \_ respond -> respond (responseLBS status404 [] "")
      Just folder ->
        let settings = defaultWebAppSettings folder
            lookupFile pieces =
              ssLookupFile settings pieces >>= \case
                LRNotFound -> ssLookupFile settings [unsafeToPiece "index.html"]
                found -> pure found
         in Tagged (staticApp settings {ssLookupFile = lookupFile})

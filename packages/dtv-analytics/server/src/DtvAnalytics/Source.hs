-- | Requests to the source: its Hasura, behind whatever authenticates them.
module DtvAnalytics.Source
  ( Client,
    Credentials (..),
    SourceError (..),
    newClient,
    clientSource,
    setCredentials,
    hasCredentials,
    eventPages,
    userDataPages,
    fetchUsers,
  )
where

import Control.Concurrent.STM (TVar, atomically, newTVarIO, readTVarIO, writeTVar)
import Control.Exception (Exception (..), throwIO)
import Control.Monad (unless, when)
import Data.Aeson ((.:), (.:?))
import Data.Aeson qualified as Aeson
import Data.Aeson.Types qualified as Aeson
import Data.ByteString qualified as ByteString
import Data.ByteString.Lazy qualified as LazyByteString
import Data.CaseInsensitive qualified as CaseInsensitive
import Data.Int (Int64)
import Data.Map.Strict qualified as Map
import Data.Maybe (catMaybes, isJust)
import Data.Text (Text)
import Data.Text qualified as Text
import Data.Text.Encoding qualified as Text
import Data.Time (UTCTime)
import DtvAnalytics.Config (Source (..))
import DtvAnalytics.Event (EventRow (..), UserDataRow (..), UserRow)
import DtvAnalytics.GraphQL (Cursor (..))
import DtvAnalytics.GraphQL qualified as GraphQL
import Network.HTTP.Client qualified as Http
import Network.HTTP.Client.TLS qualified as Http
import Network.HTTP.Types (Header, statusCode)
import Streaming (Of, Stream, lift)
import Streaming.Prelude qualified as S
import System.Environment (lookupEnv)

data Client = Client
  { source :: Source,
    manager :: Http.Manager,
    -- | The configured headers, the secret ones read from the environment.
    fixedHeaders :: [Header],
    credentials :: TVar (Maybe Credentials)
  }

-- | What the person running the server entered: a Hasura JWT, and what lets requests through
-- Cloudflare Access.
data Credentials = Credentials
  { token :: Maybe Text,
    cfAccessClientId :: Maybe Text,
    cfAccessClientSecret :: Maybe Text,
    -- | The @CF_Authorization@ cookie of a browser session, in place of a service token.
    cfAuthorization :: Maybe Text
  }

instance Aeson.FromJSON Credentials where
  parseJSON = Aeson.withObject "Credentials" \o ->
    Credentials <$> o .:? "token" <*> o .:? "cfAccessClientId" <*> o .:? "cfAccessClientSecret" <*> o .:? "cfAuthorization"

-- | The source refused a request or answered what the server cannot read.
newtype SourceError = SourceError Text
  deriving stock (Show)

instance Exception SourceError where
  displayException (SourceError message) = Text.unpack message

newClient :: Source -> IO Client
newClient source = do
  manager <- Http.newTlsManagerWith Http.tlsManagerSettings {Http.managerResponseTimeout = Http.responseTimeoutMicro 300_000_000}
  secrets <- traverse (\variable -> fmap Text.pack <$> lookupEnv (Text.unpack variable)) source.secretHeaders
  let fixedHeaders =
        [header "x-hasura-role" role | Just role <- [source.role]]
          <> [header k v | (k, v) <- Map.toList source.headers]
          <> [header k v | (k, Just v) <- Map.toList secrets]
  credentials <- newTVarIO Nothing
  pure Client {..}

clientSource :: Client -> Source
clientSource client = client.source

setCredentials :: Client -> Credentials -> IO ()
setCredentials client = atomically . writeTVar client.credentials . Just

-- | Whether requests can be made: credentials were entered, or the configuration authenticates
-- them (an admin secret, for a local source).
hasCredentials :: Client -> IO Bool
hasCredentials client = do
  entered <- readTVarIO client.credentials
  pure (isJust entered || not (Map.null client.source.secretHeaders))

-- | The events stored from @from@ until before @to@, a page at a time.
eventPages :: Client -> UTCTime -> UTCTime -> Stream (Of [EventRow]) IO ()
eventPages client from to = go Nothing
  where
    go cursor = do
      rows <- lift (query client (GraphQL.eventsPage client.source from to cursor))
      unless (null rows) do
        S.yield rows
        let lastRow = last rows
        unless (length rows < client.source.pageSize) do
          go (Just Cursor {createdAt = lastRow.createdAt, eventId = lastRow.eventId})

-- | All users' stored data, a page at a time.
userDataPages :: Client -> Stream (Of [UserDataRow]) IO ()
userDataPages client = go Nothing
  where
    go afterUser = do
      rows <- lift (query client (GraphQL.userDataPage client.source afterUser))
      unless (null rows) do
        S.yield rows
        let lastRow = last rows
        unless (length rows < client.source.pageSize) do
          go (Just lastRow.userId)

-- | The names of the given users, when the source has names.
fetchUsers :: Client -> [Int64] -> IO [UserRow]
fetchUsers _ [] = pure []
fetchUsers client ids = case client.source.users of
  Nothing -> pure []
  Just users -> query client (GraphQL.usersQuery users ids)

-- | Sends a query and reads its @rows@.
query :: (Aeson.FromJSON a) => Client -> Text -> IO [a]
query client text = do
  entered <- readTVarIO client.credentials
  request <- Http.parseRequest client.source.endpoint
  let body = Aeson.encode (Aeson.object ["query" Aeson..= text])
      request' =
        request
          { Http.method = "POST",
            Http.requestHeaders = [("content-type", "application/json")] <> client.fixedHeaders <> maybe [] credentialHeaders entered,
            Http.requestBody = Http.RequestBodyLBS body,
            -- Cloudflare Access sends a request it does not let in to its login page
            Http.redirectCount = 0
          }
  response <- Http.httpLbs request' client.manager
  let status = statusCode (Http.responseStatus response)
      responseBody = Http.responseBody response
      location = lookup "location" (Http.responseHeaders response)
  when (status >= 300 && status < 400) do
    if maybe False ("cloudflareaccess.com" `ByteString.isInfixOf`) location
      then rejected "Cloudflare Access did not let the request in: the service token or CF_Authorization cookie is missing or expired"
      else throwIO (SourceError ("HTTP " <> Text.pack (show status) <> " to " <> maybe "" Text.decodeUtf8Lenient location))
  when (status == 401 || status == 403) do
    rejected ("HTTP " <> Text.pack (show status) <> ": " <> excerpt responseBody)
  unless (status >= 200 && status < 300) do
    throwIO (SourceError ("HTTP " <> Text.pack (show status) <> ": " <> excerpt responseBody))
  case Aeson.eitherDecode responseBody >>= Aeson.parseEither rowsOf of
    Left err -> throwIO (SourceError (Text.pack err <> ": " <> excerpt responseBody))
    Right (Left errors)
      -- An expired JWT, or one without the role (issued before the source had it)
      | any ((`elem` [Just "invalid-jwt", Just "access-denied"]) . snd) errors -> rejected (Text.intercalate "; " (map fst errors))
      | otherwise -> throwIO (SourceError (Text.intercalate "; " (map fst errors)))
    Right (Right rows) -> pure rows
  where
    rowsOf = Aeson.withObject "response" \o ->
      o .:? "errors" >>= \case
        Just errors -> Left <$> traverse graphQLError errors
        Nothing -> Right <$> (o .: "data" >>= (.: "rows"))
    graphQLError = Aeson.withObject "error" \e -> do
      code <- e .:? "extensions" >>= maybe (pure Nothing) (.:? "code") :: Aeson.Parser (Maybe Text)
      (,code) <$> e .: "message"
    -- The source does not take the credentials: they are forgotten, so that the app asks for new ones
    rejected :: Text -> IO b
    rejected message = do
      atomically (writeTVar client.credentials Nothing)
      throwIO (SourceError (message <> " (connect again)"))

credentialHeaders :: Credentials -> [Header]
credentialHeaders Credentials {..} =
  catMaybes
    [ header "authorization" . ("Bearer " <>) <$> token,
      header "cf-access-client-id" <$> cfAccessClientId,
      header "cf-access-client-secret" <$> cfAccessClientSecret,
      header "cookie" . ("CF_Authorization=" <>) <$> cfAuthorization
    ]

header :: Text -> Text -> Header
header name value = (CaseInsensitive.mk (Text.encodeUtf8 name), Text.encodeUtf8 value)

-- | The start of a response, for an error: Cloudflare answers with a whole login page.
excerpt :: LazyByteString.ByteString -> Text
excerpt = Text.take 500 . Text.decodeUtf8Lenient . LazyByteString.toStrict

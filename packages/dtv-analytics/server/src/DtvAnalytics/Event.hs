-- | The rows the server fetches, as the source's response holds them under the names the
-- server's queries give them (see "DtvAnalytics.GraphQL").
module DtvAnalytics.Event
  ( EventRow (..),
    UserDataRow (..),
    UserRow (..),
  )
where

import Data.Aeson ((.:), (.:?))
import Data.Aeson qualified as Aeson
import Data.Aeson.Types qualified as Aeson
import Data.Int (Int32, Int64)
import Data.Text (Text)
import Data.Text qualified as Text
import Data.Text.Read qualified as Text
import Data.Time (UTCTime)
import Data.UUID.Types (UUID)

-- | An event: its envelope, and its own fields in 'payload' as they came.
data EventRow = EventRow
  { eventId :: Int64,
    instanceId :: UUID,
    sessionId :: UUID,
    userId :: Int64,
    impersonatorId :: Maybe Int64,
    createdAt :: UTCTime,
    occurredAt :: UTCTime,
    eventSeq :: Int32,
    definitionRevision :: Int32,
    eventType :: Text,
    viewId :: Text,
    definition :: Text,
    route :: Maybe Text,
    appVersion :: Maybe Text,
    linkSource :: Maybe Text,
    payload :: Aeson.Value
  }
  deriving stock (Eq, Show)

-- | A user's stored DTV data.
data UserDataRow = UserDataRow
  { userId :: Int64,
    -- | The source's revision of the row, or the one DTV keeps in the data.
    revision :: Int64,
    updatedAt :: Maybe UTCTime,
    userData :: Aeson.Value
  }
  deriving stock (Eq, Show)

data UserRow = UserRow
  { userId :: Int64,
    name :: Text
  }
  deriving stock (Eq, Show)

instance Aeson.FromJSON EventRow where
  parseJSON = Aeson.withObject "EventRow" \o -> do
    eventId <- bigint =<< o .: "id"
    instanceId <- o .: "instanceId"
    sessionId <- o .: "sessionId"
    userId <- bigint =<< o .: "userId"
    impersonatorId <- traverse bigint =<< o .:? "impersonatorId"
    createdAt <- o .: "createdAt"
    occurredAt <- o .: "occurredAt"
    eventSeq <- o .: "seq"
    definitionRevision <- o .: "definitionRevision"
    eventType <- o .: "eventType"
    viewId <- o .: "viewId"
    definition <- o .: "definition"
    route <- o .:? "route"
    appVersion <- o .:? "appVersion"
    linkSource <- o .:? "linkSource"
    payload <- o .: "payload"
    pure EventRow {..}

instance Aeson.FromJSON UserDataRow where
  parseJSON = Aeson.withObject "UserDataRow" \o -> do
    userId <- bigint =<< o .: "userId"
    userData <- o .: "data"
    revision <-
      o .:? "revision" >>= \case
        Just value -> bigint value
        Nothing -> Aeson.withObject "user data" (\d -> maybe (pure 0) bigint =<< d .:? "revision") userData
    updatedAt <- o .:? "updatedAt"
    pure UserDataRow {..}

instance Aeson.FromJSON UserRow where
  parseJSON = Aeson.withObject "UserRow" \o ->
    UserRow <$> (bigint =<< o .: "id") <*> o .: "name"

-- | Hasura writes a bigint as a string, so that JavaScript does not round it; a number is
-- read as well.
bigint :: Aeson.Value -> Aeson.Parser Int64
bigint = \case
  Aeson.String s -> case Text.signed Text.decimal s of
    Right (n, rest) | Text.null rest -> pure n
    _ -> fail ("not an integer: " <> Text.unpack s)
  value -> Aeson.parseJSON value

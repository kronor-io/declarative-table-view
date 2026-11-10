-- | What the server is started with: the configuration the CLI writes, and the secrets the
-- environment holds.
module DtvAnalytics.Config
  ( Config (..),
    StoreHasura (..),
    Source (..),
    Collection (..),
    Users (..),
    NamingConvention (..),
    loadConfig,
    hostField,
    optionalField,
    optionalFields,
  )
where

import Data.Aeson ((.!=), (.:), (.:?))
import Data.Aeson qualified as Aeson
import Data.Char (isUpper, toLower)
import Data.Map.Strict (Map)
import Data.Map.Strict qualified as Map
import Data.Text (Text)
import Data.Text qualified as Text
import Data.Time (NominalDiffTime)
import System.Environment (lookupEnv)

data Config = Config
  { port :: Int,
    -- | The store's connection string; @DTV_ANALYTICS_STORE@ overrides it.
    store :: Text,
    -- | The folder of the store's numbered SQL files.
    migrations :: FilePath,
    -- | The app's built files, served at @/@ when given.
    app :: Maybe FilePath,
    -- | Events stored this long before a fetch are taken as all there: a row becomes visible
    -- when its transaction commits, after rows stored later may have been read.
    settle :: NominalDiffTime,
    -- | The command that runs the sidecar and its arguments; without it nothing is derived.
    sidecar :: Maybe [String],
    -- | The CLI's manifest of the host's definitions.
    definitions :: Maybe FilePath,
    -- | The Hasura that serves the store to the app.
    storeHasura :: Maybe StoreHasura,
    -- | That Hasura's GraphQL endpoint, as the app's browser reaches it.
    appHasura :: Maybe Text,
    source :: Source
  }

data StoreHasura = StoreHasura
  { endpoint :: String,
    -- | The package's metadata for the store.
    metadata :: FilePath
  }

instance Aeson.FromJSON StoreHasura where
  parseJSON = Aeson.withObject "StoreHasura" \o -> StoreHasura <$> o .: "endpoint" <*> o .: "metadata"

data Source = Source
  { name :: Text,
    endpoint :: String,
    -- | Sent as @x-hasura-role@, when the source needs one chosen.
    role :: Maybe Text,
    -- | Sent with every request.
    headers :: Map Text Text,
    -- | Headers whose values are read from environment variables, by the variable's name.
    secretHeaders :: Map Text Text,
    namingConvention :: NamingConvention,
    pageSize :: Int,
    events :: Collection,
    userData :: Collection,
    -- | Where users' names are, when the source has them.
    users :: Maybe Users
  }

-- | A root field of the source, and the source's names for the fields the server reads, where
-- they differ from what its naming convention makes of them. An optional field the source does
-- not have is named @null@.
data Collection = Collection
  { root :: Text,
    fields :: Map Text (Maybe Text)
  }

data Users = Users
  { usersRoot :: Text,
    idField :: Text,
    nameField :: Text
  }

-- | Hasura's naming conventions: they name arguments, enum values and default field names.
data NamingConvention = GraphqlDefault | HasuraDefault
  deriving stock (Eq, Show)

instance Aeson.FromJSON Config where
  parseJSON = Aeson.withObject "Config" \o -> do
    port <- o .:? "port" .!= 8090
    store <- o .:? "store" .!= "postgresql://postgres:postgres@localhost:5432/postgres"
    migrations <- o .:? "migrations" .!= "store/migrations"
    app <- o .:? "app"
    settleMinutes <- o .:? "settleMinutes" .!= (10 :: Int)
    sidecar <- o .:? "sidecar"
    definitions <- o .:? "definitions"
    storeHasura <- o .:? "hasura"
    appHasura <- o .:? "appHasura"
    source <- o .: "source"
    pure Config {settle = fromIntegral (settleMinutes * 60), ..}

instance Aeson.FromJSON Source where
  parseJSON = Aeson.withObject "Source" \o -> do
    name <- o .: "name"
    endpoint <- o .: "endpoint"
    role <- o .:? "role"
    headers <- o .:? "headers" .!= Map.empty
    secretHeaders <- o .:? "secretHeaders" .!= Map.empty
    namingConvention <- o .:? "namingConvention" .!= GraphqlDefault
    pageSize <- o .:? "pageSize" .!= 10000
    events <- o .: "events"
    userData <- o .: "userData"
    users <- o .:? "users"
    pure Source {..}

instance Aeson.FromJSON Collection where
  parseJSON = Aeson.withObject "Collection" \o ->
    Collection <$> o .: "root" <*> o .:? "fields" .!= Map.empty

instance Aeson.FromJSON Users where
  parseJSON = Aeson.withObject "Users" \o ->
    Users <$> o .: "root" <*> o .:? "id" .!= "id" <*> o .:? "name" .!= "name"

instance Aeson.FromJSON NamingConvention where
  parseJSON = Aeson.withText "NamingConvention" \case
    "graphql-default" -> pure GraphqlDefault
    "hasura-default" -> pure HasuraDefault
    other -> fail ("unknown naming convention " <> Text.unpack other)

-- | Reads the configuration file, and the environment over it.
loadConfig :: FilePath -> IO (Either String Config)
loadConfig file =
  Aeson.eitherDecodeFileStrict file >>= \case
    Left err -> pure (Left err)
    Right config -> do
      store <- maybe config.store Text.pack <$> lookupEnv "DTV_ANALYTICS_STORE"
      pure (Right config {store})

-- | The source's name for one of the fields the server reads, given in camelCase.
hostField :: NamingConvention -> Collection -> Text -> Text
hostField convention collection field =
  case Map.lookup field collection.fields of
    Just (Just name) -> name
    _ -> conventional convention field

-- | The source's name for a field it may not have.
optionalField :: NamingConvention -> Collection -> Text -> Maybe Text
optionalField convention collection field =
  Map.findWithDefault (Just (conventional convention field)) field collection.fields

-- | Of the given fields, those the source has, with its names for them.
optionalFields :: NamingConvention -> Collection -> [Text] -> [(Text, Text)]
optionalFields convention collection fields =
  [(field, name) | field <- fields, Just name <- [optionalField convention collection field]]

conventional :: NamingConvention -> Text -> Text
conventional = \case
  GraphqlDefault -> id
  HasuraDefault -> Text.concatMap \c -> if isUpper c then Text.pack ['_', toLower c] else Text.singleton c

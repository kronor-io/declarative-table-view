-- | The queries the server sends to a source. Each names its root field @rows@ and its fields
-- the way "DtvAnalytics.Event" reads them, whatever the source calls them.
--
-- Values are written into the query text rather than passed as variables: the variables'
-- types would be named after the source's own names for its tables (@DtvEventBoolExp@),
-- which the configuration does not give.
module DtvAnalytics.GraphQL
  ( Cursor (..),
    eventsPage,
    userDataPage,
    usersQuery,
    timestamp,
  )
where

import Data.Aeson qualified as Aeson
import Data.ByteString.Lazy qualified as LazyByteString
import Data.Int (Int64)
import Data.Text (Text)
import Data.Text qualified as Text
import Data.Text.Encoding qualified as Text
import Data.Time (UTCTime, defaultTimeLocale, formatTime)
import DtvAnalytics.Config (Collection (..), NamingConvention (..), Source (..), Users (..), hostField, optionalFields)

-- | Where a page of events ends: the next page starts after it, in the order
-- @(createdAt, id)@.
data Cursor = Cursor
  { createdAt :: UTCTime,
    eventId :: Int64
  }
  deriving stock (Eq, Show)

-- | What every source has: DTV's envelope, the event's own fields, who reported it and when
-- the source stored it.
eventFields :: [Text]
eventFields =
  [ "id",
    "instanceId",
    "sessionId",
    "userId",
    "createdAt",
    "occurredAt",
    "seq",
    "definitionRevision",
    "eventType",
    "viewId",
    "definition",
    "payload"
  ]

-- | What a host may store beside an event.
optionalEventFields :: [Text]
optionalEventFields = ["impersonatorId", "route", "appVersion", "linkSource"]

-- | The events stored from @from@ until before @to@, after the cursor.
eventsPage :: Source -> UTCTime -> UTCTime -> Maybe Cursor -> Text
eventsPage source from to cursor =
  rowsQuery source source.events.root conditions [("createdAt", True), ("id", True)] eventFields'
  where
    field = hostField source.namingConvention source.events
    createdAt = field "createdAt"
    conditions =
      [ compare' createdAt "_gte" (string (timestamp from)),
        compare' createdAt "_lt" (string (timestamp to))
      ]
        <> maybe [] (pure . after) cursor
    after c =
      object
        [ ( "_or",
            list
              [ compare' createdAt "_gt" (string (timestamp c.createdAt)),
                and' [compare' createdAt "_eq" (string (timestamp c.createdAt)), compare' (field "id") "_gt" (showText c.eventId)]
              ]
          )
        ]
    eventFields' =
      [(f, field f) | f <- eventFields] <> optionalFields source.namingConvention source.events optionalEventFields

-- | Users' stored data, by user id, after the given one.
userDataPage :: Source -> Maybe Int64 -> Text
userDataPage source afterUser =
  rowsQuery source source.userData.root conditions [("userId", False)] fields
  where
    fields =
      [(f, field f) | f <- ["userId", "data"]]
        <> optionalFields source.namingConvention source.userData ["revision", "updatedAt"]
    field = hostField source.namingConvention source.userData
    conditions = maybe [] (\u -> [compare' (field "userId") "_gt" (showText u)]) afterUser

-- | The names of the given users.
usersQuery :: Users -> [Int64] -> Text
usersQuery users ids =
  "query { rows: "
    <> users.usersRoot
    <> "(where: "
    <> compare' users.idField "_in" (list (map showText ids))
    <> ") { id: "
    <> users.idField
    <> " name: "
    <> users.nameField
    <> " } }"

-- | A query of up to a page of rows, ordered by the given fields (the 'Bool' says whether the
-- field is one of the events', named through the events' collection, or the user data's).
rowsQuery :: Source -> Text -> [Text] -> [(Text, Bool)] -> [(Text, Text)] -> Text
rowsQuery source root conditions ordering fields =
  "query { rows: "
    <> root
    <> "(where: "
    <> and' conditions
    <> ", "
    <> orderByArgument
    <> ": "
    <> list [object [(orderField f isEvent, ascending)] | (f, isEvent) <- ordering]
    <> ", limit: "
    <> showText source.pageSize
    <> ") { "
    <> Text.unwords [alias <> ": " <> name | (alias, name) <- fields]
    <> " } }"
  where
    orderField f isEvent = hostField source.namingConvention (if isEvent then source.events else source.userData) f
    (orderByArgument, ascending) = case source.namingConvention of
      GraphqlDefault -> ("orderBy", "ASC")
      HasuraDefault -> ("order_by", "asc")

compare' :: Text -> Text -> Text -> Text
compare' field operator value = object [(field, object [(operator, value)])]

and' :: [Text] -> Text
and' conditions = object [("_and", list conditions)]

object :: [(Text, Text)] -> Text
object pairs = "{" <> Text.intercalate ", " [k <> ": " <> v | (k, v) <- pairs] <> "}"

list :: [Text] -> Text
list items = "[" <> Text.intercalate ", " items <> "]"

-- | A GraphQL string: JSON's escapes are GraphQL's.
string :: Text -> Text
string = Text.decodeUtf8 . LazyByteString.toStrict . Aeson.encode

showText :: (Show a) => a -> Text
showText = Text.pack . show

-- | A timestamp with all its digits, so that a cursor compares equal to
-- the row it was read from.
timestamp :: UTCTime -> Text
timestamp = Text.pack . formatTime defaultTimeLocale "%Y-%m-%dT%H:%M:%S%QZ"

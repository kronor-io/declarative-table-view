module DtvAnalytics.GraphQLSpec (spec) where

import Data.Map.Strict qualified as Map
import Data.Text qualified as Text
import Data.Time (UTCTime (..), fromGregorian, picosecondsToDiffTime)
import DtvAnalytics.Config
import DtvAnalytics.GraphQL
import Test.Hspec

testSource :: NamingConvention -> Source
testSource namingConvention =
  Source
    { name = "test",
      endpoint = "http://localhost:8080/v1/graphql",
      role = Just "dtv_analytics_query",
      headers = Map.empty,
      secretHeaders = Map.empty,
      namingConvention,
      pageSize = 100,
      events = Collection {root = "DtvEvent", fields = Map.fromList [("linkSource", Nothing)]},
      userData = Collection {root = "DTVUserData", fields = Map.fromList [("data", Just "settings"), ("updatedAt", Nothing)]},
      users = Just testUsers
    }

testUsers :: Users
testUsers =
  Users {usersRoot = "User", idField = "id", nameField = "realname"
    }

day :: Int -> UTCTime
day d = UTCTime (fromGregorian 2026 11 d) 0

spec :: Spec
spec = do
  describe "eventsPage" do
    it "asks for a page of the period in the order of the cursor" do
      let query = eventsPage (testSource GraphqlDefault) (day 1) (day 2) Nothing
      query `shouldSatisfy` Text.isInfixOf "rows: DtvEvent(where: {_and: [{createdAt: {_gte: \"2026-11-01T00:00:00Z\"}}, {createdAt: {_lt: \"2026-11-02T00:00:00Z\"}}]}"
      query `shouldSatisfy` Text.isInfixOf "orderBy: [{createdAt: ASC}, {id: ASC}], limit: 100"

    it "continues after the cursor, also among rows stored at the same time" do
      let at = UTCTime (fromGregorian 2026 11 1) (picosecondsToDiffTime 420_244_000_000)
          query = eventsPage (testSource GraphqlDefault) (day 1) (day 2) (Just (Cursor at 17))
      query
        `shouldSatisfy` Text.isInfixOf
          "{_or: [{createdAt: {_gt: \"2026-11-01T00:00:00.420244Z\"}}, {_and: [{createdAt: {_eq: \"2026-11-01T00:00:00.420244Z\"}}, {id: {_gt: 17}}]}]}"

    it "names fields as the source's naming convention does" do
      let query = eventsPage (testSource HasuraDefault) (day 1) (day 2) Nothing
      query `shouldSatisfy` Text.isInfixOf "order_by: [{created_at: asc}, {id: asc}]"
      query `shouldSatisfy` Text.isInfixOf "instanceId: instance_id"

    it "leaves out what the source does not have" do
      let query = eventsPage (testSource GraphqlDefault) (day 1) (day 2) Nothing
      query `shouldSatisfy` Text.isInfixOf "route: route"
      query `shouldNotSatisfy` Text.isInfixOf "linkSource"

  describe "userDataPage" do
    it "names a field the way the configuration says" do
      userDataPage (testSource GraphqlDefault) (Just 5) `shouldSatisfy` Text.isInfixOf "data: settings"
      userDataPage (testSource GraphqlDefault) (Just 5) `shouldSatisfy` Text.isInfixOf "{userId: {_gt: 5}}"
      userDataPage (testSource GraphqlDefault) (Just 5) `shouldNotSatisfy` Text.isInfixOf "updatedAt"

  describe "usersQuery" do
    it "asks for the names of the given users" do
      usersQuery testUsers [1, 2]
        `shouldBe` "query { rows: User(where: {id: {_in: [1, 2]}}) { id: id name: realname } }"

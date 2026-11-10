module DtvAnalytics.EventSpec (spec) where

import Data.Aeson qualified as Aeson
import Data.Time (UTCTime (..), fromGregorian, picosecondsToDiffTime)
import DtvAnalytics.Event (EventRow (..), UserDataRow (..))
import Test.Hspec

spec :: Spec
spec = do
  describe "EventRow" do
    -- As finance's Hasura answers, under the names the server's query gives the fields
    let row =
          "{\"id\":\"2\",\"instanceId\":\"531d99a6-37fb-4f54-8ae4-fc65dd3ad7b5\",\
          \\"sessionId\":\"1bede109-ee1a-4237-9816-9fabd96c7449\",\"userId\":\"807\",\
          \\"impersonatorId\":null,\"createdAt\":\"2026-11-04T10:00:43.420244+01:00\",\
          \\"occurredAt\":\"2026-11-04T10:00:39.825+01:00\",\"seq\":2,\"definitionRevision\":1,\
          \\"eventType\":\"viewMounted\",\"viewId\":\"financial-period-list\",\
          \\"definition\":\"financial-period-list\",\"route\":\"/settings/financial-period/list\",\
          \\"appVersion\":\"2f968476\",\"linkSource\":null,\"payload\":{\"popout\":false}}"
        event = Aeson.decode row :: Maybe EventRow

    it "reads a bigint written as a string" do
      fmap (.eventId) event `shouldBe` Just 2
      fmap (.userId) event `shouldBe` Just 807

    it "reads the source's timestamps in UTC, to the microsecond" do
      fmap (.createdAt) event
        `shouldBe` Just (UTCTime (fromGregorian 2026 11 4) (picosecondsToDiffTime (9 * 3600 * 10 ^ (12 :: Int) + 43_420_244 * 10 ^ (6 :: Int))))

    it "keeps the payload as it came" do
      fmap (.payload) event `shouldBe` Just (Aeson.object ["popout" Aeson..= False])

  describe "UserDataRow" do
    it "reads a bigint written as a number as well" do
      let row = "{\"userId\":944,\"revision\":\"0\",\"updatedAt\":\"2026-09-22T09:03:40.645074+02:00\",\"data\":{}}"
      fmap (\r -> (r.userId, r.revision)) (Aeson.decode row :: Maybe UserDataRow) `shouldBe` Just (944, 0)

    it "takes the revision DTV keeps in the data when the source has none" do
      let row = "{\"userId\":\"7\",\"data\":{\"revision\":12,\"views\":{}}}"
      fmap (\r -> (r.revision, r.updatedAt)) (Aeson.decode row :: Maybe UserDataRow) `shouldBe` Just (12, Nothing)

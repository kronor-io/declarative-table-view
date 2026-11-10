-- | The Node process that answers for DTV's code (see @src/sidecar@): one JSON line per
-- request, one per answer, one request at a time.
module DtvAnalytics.Sidecar
  ( Sidecar,
    SidecarError (..),
    withSidecar,
    ask,
  )
where

import Control.Concurrent.MVar (MVar, newMVar, withMVar)
import Control.Exception (Exception, throwIO)
import Data.Aeson ((.:))
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Aeson.Types qualified as Aeson
import Data.ByteString.Char8 qualified as ByteString
import Data.ByteString.Lazy qualified as LazyByteString
import Data.Text (Text)
import Data.Text qualified as Text
import System.IO (Handle, hFlush)
import System.Process.Typed

newtype Sidecar = Sidecar (MVar (Handle, Handle))

newtype SidecarError = SidecarError Text
  deriving stock (Show)

instance Exception SidecarError

-- | Runs the sidecar for as long as the action does.
withSidecar :: FilePath -> [String] -> (Sidecar -> IO a) -> IO a
withSidecar command args action =
  withProcessTerm (setStdin createPipe $ setStdout createPipe $ setStderr inherit $ proc command args) \process -> do
    lock <- newMVar (getStdin process, getStdout process)
    action (Sidecar lock)

-- | Sends a request and waits for its answer.
ask :: Sidecar -> Aeson.Value -> IO Aeson.Value
ask (Sidecar lock) request = withMVar lock \(input, output) -> do
  LazyByteString.hPut input (Aeson.encode request <> "\n")
  hFlush input
  line <- ByteString.hGetLine output
  case Aeson.eitherDecodeStrict line of
    Left err -> throwIO (SidecarError (Text.pack err))
    Right answer@(Aeson.Object o)
      | KeyMap.member "error" o -> throwIO (SidecarError (either Text.pack id (Aeson.parseEither (.: "error") o)))
      | otherwise -> pure answer
    Right _ -> throwIO (SidecarError "The answer is not an object")

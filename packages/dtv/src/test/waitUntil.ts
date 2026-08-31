// Polls a condition instead of sleeping a fixed interval. Fixed sleeps race with
// React's effects and the mocked fetches they kick off: on a loaded machine the
// request has not landed yet when the assertion runs.
//
// Always wait for something to *appear*. A negative predicate ("the loading text
// is gone") is already true before the component mounts, so it falls straight
// through and asserts against an empty render.
// The default timeout stays below Jest's 5s per-test limit on purpose: if it matched,
// Jest would kill the test first and report a bare "exceeded timeout" instead of naming
// the condition that never came true. These waits are on mocked, in-memory work.
export async function waitUntil(
    predicate: () => boolean,
    { timeoutMs = 2000, intervalMs = 5, description = 'condition' }: { timeoutMs?: number; intervalMs?: number; description?: string } = {}
): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
}

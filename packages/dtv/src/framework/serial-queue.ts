/**
 * Runs async tasks one after another, in the order they were enqueued. A failing task
 * fails only for its own caller; the tasks after it still run.
 */
export type SerialQueue = {
    enqueue<T>(task: () => Promise<T>): Promise<T>
}

const settled = (): void => undefined

/**
 * @param after Tasks start only once this promise has settled, whatever its outcome.
 */
export function createSerialQueue(after: Promise<unknown> = Promise.resolve()): SerialQueue {
    // The tail is always a promise that resolves once the latest task has settled, whether
    // it succeeded or failed. It therefore never rejects, and the next task can be chained
    // with a plain `then`.
    let tail: Promise<void> = after.then(settled, settled)

    return {
        enqueue(task) {
            const result = tail.then(task)
            tail = result.then(settled, settled)
            return result
        }
    }
}

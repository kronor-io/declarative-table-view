/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { FetchDataResult } from '../data'
import type { ReportedEvent } from '../analytics'
import { startPageSession } from '../analytics-emitter'
import { useAppState, type AppState, type AppStateEffects, type AppStateEnv, type HostCommand, type Msg, type Query } from '.'

const env: AppStateEnv = {
    filterGroups: () => [],
    rowsPerPageOptions: [],
    orderableFields: () => [],
    definition: viewId => ({ definition: viewId, definitionRevision: 1 }),
    snapshotDiff: () => null
}

const rows = (...ids: number[]): FetchDataResult => ({
    rows: ids.map(id => ({ id })),
    flattenedRows: ids.map(id => ({ id: { id } }))
})

/** A fetch the test answers, or sees aborted. */
interface PendingFetch {
    query: Query
    signal: AbortSignal
    resolve: (rows: FetchDataResult) => void
}

let fetches: PendingFetch[]
/** The commands run, analytics events apart. */
let commands: HostCommand[]
/** The analytics events reported (a fetch with its outcome) and the requests started, in order. */
let effectLog: string[]
let latest: { model: AppState; dispatch: (msg: Msg) => void; report: (event: ReportedEvent) => void }
let root: Root

// A fetch that answers when the test says so, aborted or not: a response can arrive after
// its request was superseded
const effects: AppStateEffects = {
    fetchRows: ({ query, reason }, signal) => new Promise(resolve => {
        effectLog.push(`fetch ${reason}`)
        fetches.push({ query, signal, resolve })
    }),
    runCommand: command => {
        commands.push(command)
    },
    onEvent: event => {
        effectLog.push(event.type === 'fetch' ? `${event.type} ${event.outcome}` : event.type)
    }
}

let renders = 0

function Harness({ reportWhileRendering, analytics = true }: { reportWhileRendering?: ReportedEvent; analytics?: boolean }) {
    const [model, dispatch, report] = useAppState(env, { viewId: 'payments', rowsPerPage: 2 }, analytics ? effects : { ...effects, onEvent: undefined })
    latest = { model, dispatch, report }
    renders += 1
    // As the user data manager does: it starts loading as it is created, during the first render
    const reported = React.useRef(false)
    if (reportWhileRendering && !reported.current) {
        reported.current = true
        report(reportWhileRendering)
    }
    return null
}

const send = (msg: Msg) => act(async () => { latest.dispatch(msg) })

const userDataLoaded: Msg = {
    tag: 'userDataChanged',
    viewId: 'payments',
    userData: { ready: true, syncFilterState: true, persistedFilterState: null, rowsPerPage: null, syncOrdering: true, ordering: null }
}

describe('useAppState', () => {
    beforeEach(async () => {
        fetches = []
        commands = []
        effectLog = []
        // A session under way: what a table reports first in a session is tested with the App
        startPageSession().started = true
        root = createRoot(document.createElement('div'))
        await act(async () => { root.render(React.createElement(Harness)) })
    })

    it('fetches nothing until a request is pending, then fetches it once', async () => {
        expect(fetches).toHaveLength(0)

        await send(userDataLoaded)
        // A message that changes nothing does not fetch again
        await send(userDataLoaded)

        expect(fetches).toHaveLength(1)
        await act(async () => { root.unmount() })
    })

    it('aborts a superseded request and shows the newer one only', async () => {
        await send(userDataLoaded)
        await send({ tag: 'refreshRequested' })

        expect(fetches.map(f => f.signal.aborted)).toEqual([true, false])

        // The superseded response arrives anyway, before the newer one
        await act(async () => { fetches[0].resolve(rows(9)) })
        expect(latest.model.table.tag).toBe('loading')

        await act(async () => { fetches[1].resolve(rows(1, 2)) })

        expect(latest.model.table.tag).toBe('loaded')
        expect(latest.model.table.tag === 'loaded' && latest.model.table.page.rows).toEqual(rows(1, 2))
        await act(async () => { root.unmount() })
    })

    it('aborts the pending request on unmount', async () => {
        await send(userDataLoaded)
        await act(async () => { root.unmount() })

        expect(fetches[0].signal.aborted).toBe(true)
    })

    it('shows no rows rather than waiting forever when a fetch fails', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
        const failing: AppStateEffects = { ...effects, fetchRows: () => Promise.reject(new Error('offline')) }
        function FailingHarness() {
            const [model, dispatch, report] = useAppState(env, { viewId: 'payments', rowsPerPage: 2 }, failing)
            latest = { model, dispatch, report }
            return null
        }
        await act(async () => { root.render(React.createElement(FailingHarness)) })

        await send(userDataLoaded)

        expect(latest.model.table.tag === 'loaded' && latest.model.table.page.rows).toEqual(rows())
        expect(error).toHaveBeenCalled()
        error.mockRestore()
        await act(async () => { root.unmount() })
    })

    it('fetches once and runs each command once in StrictMode', async () => {
        await act(async () => { root.unmount() })
        fetches = []
        root = createRoot(document.createElement('div'))
        await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Harness))) })

        await send(userDataLoaded)
        await send({ tag: 'rowsPerPageChanged', rowsPerPage: 3 })

        // StrictMode calls the reducer twice per message: the command it returns still runs
        // once, and the request the rows per page change supersedes is the only one aborted
        expect(commands).toEqual([{ tag: 'persistRowsPerPage', viewId: 'payments', rowsPerPage: 3 }])
        expect(fetches.map(f => f.signal.aborted)).toEqual([true, false])
        await act(async () => { root.unmount() })
    })

    it('runs each command once, in order', async () => {
        await send(userDataLoaded)
        await act(async () => {
            latest.dispatch({ tag: 'rowsPerPageChanged', rowsPerPage: 3 })
            latest.dispatch({ tag: 'rowsPerPageChanged', rowsPerPage: 4 })
        })
        await send({ tag: 'refreshRequested' })

        expect(commands).toEqual([
            { tag: 'persistRowsPerPage', viewId: 'payments', rowsPerPage: 3 },
            { tag: 'persistRowsPerPage', viewId: 'payments', rowsPerPage: 4 }
        ])
        await act(async () => { root.unmount() })
    })

    it('reports the event of a transition before the request it started', async () => {
        await send(userDataLoaded)
        await send({ tag: 'filtersApplied', filters: new Map(), trigger: 'submit' })

        // The filters a request is for are always reported before it starts
        expect(effectLog).toEqual(['viewMounted', 'filtersApplied', 'fetch filters', 'filtersApplied', 'fetch filters'])
        await act(async () => { root.unmount() })
    })

    it('reports a request when it ends, with how it ended', async () => {
        await send(userDataLoaded)
        await act(async () => { fetches[0].resolve(rows(1)) })
        await send({ tag: 'refreshRequested' })
        await act(async () => { root.unmount() })

        expect(effectLog.filter(entry => entry.startsWith('fetch'))).toEqual(['fetch filters', 'fetch succeeded', 'fetch refresh'])
    })

    it('reports what is reported before the table mounted after it did, and at once after it unmounted', async () => {
        await act(async () => { root.unmount() })
        effectLog = []
        root = createRoot(document.createElement('div'))
        await act(async () => {
            root.render(React.createElement(Harness, { reportWhileRendering: { type: 'userDataConflict', resolved: true } }))
        })
        await act(async () => { root.unmount() })
        latest.report({ type: 'rowExpansionLoad', startedAt: 0, durationMs: 1, outcome: 'succeeded' })

        expect(effectLog).toEqual(['viewMounted', 'userDataConflict', 'viewUnmounted', 'rowExpansionLoad'])
    })

    it('reports each event once in StrictMode, and an unmount only when the table unmounts', async () => {
        await act(async () => { root.unmount() })
        effectLog = []
        root = createRoot(document.createElement('div'))
        await act(async () => {
            root.render(React.createElement(React.StrictMode, null,
                React.createElement(Harness, { reportWhileRendering: { type: 'userDataConflict', resolved: true } })))
        })
        await send(userDataLoaded)

        // StrictMode mounted, unmounted and mounted the table again: one mount, nothing lost
        expect(effectLog).toEqual(['viewMounted', 'userDataConflict', 'filtersApplied', 'fetch filters'])
        await act(async () => { root.unmount() })
        expect(effectLog.slice(4)).toEqual(['viewUnmounted'])
    })

    it('reports the latest of debounced events once they pause, or as the table unmounts', async () => {
        // The unmount is reported in a microtask
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
        try {
            await send({ tag: 'searchQueryChanged', searchQuery: 'am' })
            await send({ tag: 'searchQueryChanged', searchQuery: 'amount' })
            await act(async () => { jest.advanceTimersByTime(1000) })
            await send({ tag: 'searchQueryChanged', searchQuery: 'date' })
            await act(async () => { root.unmount() })
        } finally {
            jest.useRealTimers()
        }

        expect(effectLog.filter(entry => entry !== 'panelShown')).toEqual(['viewMounted', 'filterSearch', 'filterSearch', 'viewUnmounted'])
    })

    it('reports a response that arrives once its request was superseded as aborted', async () => {
        await send(userDataLoaded)
        await send({ tag: 'refreshRequested' })
        await act(async () => { fetches[0].resolve(rows(1)) })
        await act(async () => { root.unmount() })

        expect(effectLog.filter(entry => entry.startsWith('fetch'))).toEqual(['fetch filters', 'fetch refresh', 'fetch aborted'])
    })

    it('reports what was reported as the table unmounted in the same batch', async () => {
        await act(async () => {
            latest.report({ type: 'shareLinkCreated', from: 'filterForm' })
            root.unmount()
        })

        expect(effectLog).toEqual(['viewMounted', 'shareLinkCreated', 'viewUnmounted'])
    })

    it('does no analytics work without a handler', async () => {
        await act(async () => { root.unmount() })
        effectLog = []
        root = createRoot(document.createElement('div'))
        await act(async () => { root.render(React.createElement(Harness, { analytics: false })) })
        const before = renders
        await act(async () => { latest.report({ type: 'shareLinkCreated', from: 'filterForm' }) })

        expect(renders).toBe(before)
        await act(async () => { root.unmount() })
        expect(effectLog).toEqual([])
    })

    it('drops a debounced event cancelled before it was reported', async () => {
        // The unmount is reported in a microtask
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
        try {
            await send({ tag: 'searchQueryChanged', searchQuery: 'amou' })
            await send({ tag: 'searchQueryChanged', searchQuery: '' })
            await act(async () => { jest.advanceTimersByTime(1000) })
            await act(async () => { root.unmount() })
        } finally {
            jest.useRealTimers()
        }

        expect(effectLog).not.toContain('filterSearch')
    })
})

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { FetchDataResult } from '../data'
import { useAppState, type AppState, type AppStateEffects, type AppStateEnv, type Command, type Msg, type Query } from '.'

const env: AppStateEnv = { filterGroups: () => [], rowsPerPageOptions: [], orderableFields: () => [] }

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
let commands: Command[]
let latest: { model: AppState; dispatch: (msg: Msg) => void }
let root: Root

// A fetch that answers when the test says so, aborted or not: a response can arrive after
// its request was superseded
const effects: AppStateEffects = {
    fetchRows: (query, signal) => new Promise(resolve => {
        fetches.push({ query, signal, resolve })
    }),
    runCommand: command => {
        commands.push(command)
    }
}

function Harness() {
    const [model, dispatch] = useAppState(env, { viewId: 'payments', rowsPerPage: 2 }, effects)
    latest = { model, dispatch }
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
            const [model, dispatch] = useAppState(env, { viewId: 'payments', rowsPerPage: 2 }, failing)
            latest = { model, dispatch }
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
})

import { describe, it, expect } from '@jest/globals'

import type { FetchDataResult } from '../data'
import * as FilterValue from '../filterValue'
import {
    currentQuery, hasNextPage, hasPreviousPage, initAppState, isLoading, pendingRequest, shownPage, updateAppState,
    type AppState, type AppStateEnv, type AppStateInit, type Command, type FilterState, type DataRequest, type Msg, type RequestId, type ViewUserData
} from '.'
import type { FilterGroups } from '../filters'
import type { ViewId } from '../view'

const env: AppStateEnv = {
    filterGroups: () => [],
    rowsPerPageOptions: [2, 3, 50],
    orderableFields: () => ['id', 'amount']
}

const emailFilter = (email: string): FilterState =>
    new Map([['email', { type: 'leaf', value: FilterValue.value(email) }]])

const emailOf = (filters: FilterState | undefined): unknown => {
    const leaf = filters?.get('email')
    return leaf?.type === 'leaf' && FilterValue.isValue(leaf.value) ? leaf.value.value : undefined
}

const options = (overrides: Partial<AppStateInit> = {}): AppStateInit => ({
    viewId: 'payments',
    rowsPerPage: 2,
    ...overrides
})

/** The user data of a view arrives: the local copy (`ready: false`), or the loaded one. */
const userDataArrives = (overrides: Partial<ViewUserData> = {}, viewId: ViewId = 'payments'): Msg => ({
    tag: 'userDataChanged',
    viewId,
    userData: {
        ready: false, syncFilterState: true, persistedFilterState: null, rowsPerPage: null, syncOrdering: true, ordering: null,
        ...overrides
    }
})

const loaded = (overrides: Partial<ViewUserData> = {}, viewId?: ViewId) => userDataArrives({ ready: true, ...overrides }, viewId)

const rows = (...ids: number[]): FetchDataResult => ({
    rows: ids.map(id => ({ id })),
    flattenedRows: ids.map(id => ({ id: { id } }))
})

type Step = Msg | ((model: AppState) => Msg)

/**
 * Runs a program: the messages in order, each against the state the one before left. Records
 * what an interpreter would do: start every request that becomes pending (once), and run
 * every command.
 */
function run(initial: AppState, steps: readonly Step[]) {
    let model = initial
    const requests: DataRequest[] = []
    const commands: Command[] = []
    const observe = () => {
        const request = pendingRequest(model.table)
        if (request && requests.at(-1)?.id !== request.id) requests.push(request)
    }

    observe()
    for (const step of steps) {
        const msg = typeof step === 'function' ? step(model) : step
        const [next, emitted] = updateAppState(env, model, msg)
        model = next
        commands.push(...emitted)
        observe()
    }
    return { model, requests, commands }
}

/** Runs a program on a table that just mounted. */
const start = (...steps: Step[]) => run(initAppState(env, options()), steps)

/** Answers the pending request, whatever it is. */
const answer = (answerRows: FetchDataResult) => (model: AppState): Msg => {
    const request = pendingRequest(model.table)
    if (!request) throw new Error('No request is pending')
    return { tag: 'rowsArrived', requestId: request.id, rows: answerRows }
}

describe('hydration', () => {
    it('requests nothing before the user data arrives', () => {
        expect(start().requests).toEqual([])
    })

    it('starts with the filter state persisted locally, in one request', () => {
        const { requests } = start(
            userDataArrives({ persistedFilterState: emailFilter('local') }),
            loaded({ persistedFilterState: emailFilter('local') })
        )

        expect(requests.map(r => emailOf(r.query.filters))).toEqual(['local'])
    })

    it('waits for the initial load, then requests once with the filter state it brings', () => {
        const { requests } = start(userDataArrives(), loaded({ persistedFilterState: emailFilter('remote') }))

        expect(requests.map(r => emailOf(r.query.filters))).toEqual(['remote'])
    })

    it('starts from the defaults when the initial load brings nothing', () => {
        const { requests } = start(userDataArrives(), loaded())

        expect(requests.map(r => r.query.filters.size)).toEqual([0])
    })

    it('does not wait for the initial load when syncing is off', () => {
        const { requests } = start(userDataArrives({ syncFilterState: false }))

        expect(requests).toHaveLength(1)
    })

    it('prefers the filter state the page was opened with over a persisted one', () => {
        const { requests } = run(initAppState(env, options({ initialFilterState: emailFilter('link') })), [
            userDataArrives({ persistedFilterState: emailFilter('persisted') })
        ])

        expect(requests.map(r => emailOf(r.query.filters))).toEqual(['link'])
    })

    it('includes the persisted rows per page in the first request', () => {
        const { requests } = start(userDataArrives(), loaded({ persistedFilterState: emailFilter('remote'), rowsPerPage: 50 }))

        expect(requests.map(r => r.query.rowsPerPage)).toEqual([50])
    })

    it('ignores a persisted rows per page that is not an option', () => {
        const { requests } = start(userDataArrives({ syncFilterState: false, rowsPerPage: 7 }))

        expect(requests.map(r => r.query.rowsPerPage)).toEqual([2])
    })

    it('keeps the filters once settled when another tab persists different ones', () => {
        const { model, requests } = start(
            loaded({ persistedFilterState: emailFilter('mine') }),
            answer(rows(1)),
            loaded({ persistedFilterState: emailFilter('other tab') })
        )

        expect(requests).toHaveLength(1)
        expect(emailOf(currentQuery(model.table)?.filters)).toBe('mine')
    })

    it('keeps a draft the user edited while hydrating', () => {
        const { model } = start(
            userDataArrives(),
            { tag: 'draftChanged', filters: emailFilter('typing') },
            loaded({ persistedFilterState: emailFilter('remote') })
        )

        expect(emailOf(model.filterState)).toBe('typing')
        expect(emailOf(currentQuery(model.table)?.filters)).toBe('remote')
    })

    it('changes nothing for user data that holds nothing new', () => {
        const { model } = start(loaded(), answer(rows(1)))

        expect(updateAppState(env, model, loaded())[0]).toBe(model)
    })

    it('does not undo a rows per page change with a re-read that still holds the previous one', () => {
        // Another write finishes first, and the re-read after it still holds 50
        const { model, requests } = start(
            loaded({ rowsPerPage: 50 }),
            answer(rows(1)),
            { tag: 'rowsPerPageChanged', rowsPerPage: 3 },
            loaded({ rowsPerPage: 50, persistedFilterState: emailFilter('written') }),
            loaded({ rowsPerPage: 3, persistedFilterState: emailFilter('written') })
        )

        expect(requests.map(r => r.query.rowsPerPage)).toEqual([50, 3])
        expect(model.rowsPerPage).toBe(3)
    })

    it('settles with the filters the user applies while hydrating', () => {
        const { model, requests } = start(
            userDataArrives(),
            { tag: 'filtersApplied', filters: emailFilter('typed') },
            loaded({ persistedFilterState: emailFilter('remote') })
        )

        expect(requests.map(r => emailOf(r.query.filters))).toEqual(['typed'])
        expect(emailOf(currentQuery(model.table)?.filters)).toBe('typed')
    })
})

describe('the draft', () => {
    it('shows the filter state the view settles with', () => {
        const { model } = start(loaded({ persistedFilterState: emailFilter('remote') }))

        expect(emailOf(model.filterState)).toBe('remote')
    })

    it('changes without a request, and applying it applies its latest state', () => {
        const { requests } = start(
            loaded(),
            answer(rows(1)),
            { tag: 'draftChanged', filters: emailFilter('first') },
            { tag: 'draftChanged', filters: emailFilter('second') },
            { tag: 'draftApplied' }
        )

        expect(requests.map(r => emailOf(r.query.filters))).toEqual([undefined, 'second'])
    })

    it('stays as it is when other filters are applied', () => {
        const { model } = start(
            loaded(),
            { tag: 'draftChanged', filters: emailFilter('editing') },
            { tag: 'filtersApplied', filters: emailFilter('saved filter') }
        )

        expect(emailOf(model.filterState)).toBe('editing')
        expect(emailOf(currentQuery(model.table)?.filters)).toBe('saved filter')
    })
})

describe('responses', () => {
    it('shows the previous rows while loading and ignores a superseded response', () => {
        const { model: first } = start(loaded())
        const firstId = pendingRequest(first.table)!.id

        const { model } = run(first, [
            { tag: 'rowsArrived', requestId: firstId, rows: rows(1, 2) },
            { tag: 'filtersApplied', filters: emailFilter('a') },
            { tag: 'filtersApplied', filters: emailFilter('b') },
            // The response to 'a' arrives after 'b' was asked for
            { tag: 'rowsArrived', requestId: (firstId + 1) as RequestId, rows: rows(9) }
        ])

        expect(isLoading(model.table)).toBe(true)
        expect(shownPage(model.table)?.rows).toEqual(rows(1, 2))
        expect(emailOf(currentQuery(model.table)?.filters)).toBe('b')
    })

    it('shows the rows with the query they answer', () => {
        const { model } = start(loaded(), { tag: 'filtersApplied', filters: emailFilter('a') }, answer(rows(1)))

        expect(isLoading(model.table)).toBe(false)
        expect(emailOf(shownPage(model.table)?.query.filters)).toBe('a')
    })
})

describe('pagination', () => {
    const loadedFirstPage = () => start(loaded(), answer(rows(1, 2))).model

    it('starts the next page after the last row, and shows the page number of the rows on screen', () => {
        const { model, requests } = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }])

        expect(requests.map(r => r.query.cursors)).toEqual([[{ id: 2 }]])
        expect(shownPage(model.table)?.query.cursors).toHaveLength(0)

        const answered = run(model, [answer(rows(3, 4))]).model
        expect(shownPage(answered.table)?.query.cursors).toHaveLength(1)
    })

    it('has no next page after a partial page, nor while loading', () => {
        const partial = start(loaded(), answer(rows(1))).model
        expect(hasNextPage(partial.table)).toBe(false)
        expect(run(partial, [{ tag: 'nextPageRequested' }]).requests).toHaveLength(0)

        const loading = run(loadedFirstPage(), [{ tag: 'refreshRequested' }]).model
        expect(hasNextPage(loading.table)).toBe(false)
    })

    it('goes back to the cursor before', () => {
        const { model } = run(loadedFirstPage(), [
            { tag: 'nextPageRequested' }, answer(rows(3, 4)),
            { tag: 'nextPageRequested' }, answer(rows(5, 6)),
            { tag: 'previousPageRequested' }
        ])

        expect(currentQuery(model.table)?.cursors).toEqual([{ id: 2 }])
        expect(hasPreviousPage(model.table)).toBe(true)
    })

    it('refreshes the current page rather than the first', () => {
        const { model } = run(loadedFirstPage(), [
            { tag: 'nextPageRequested' }, answer(rows(3, 4)),
            { tag: 'refreshRequested' }
        ])

        expect(pendingRequest(model.table)?.query.cursors).toEqual([{ id: 2 }])
    })

    it('stays on the page on screen while moving to another: refreshing refetches it', () => {
        const { model, requests } = run(loadedFirstPage(), [
            { tag: 'nextPageRequested' },
            { tag: 'refreshRequested' }
        ])

        expect(requests.map(r => r.query.cursors)).toEqual([[{ id: 2 }], []])
        expect(model.table.tag).toBe('loading')
    })

    it('goes back from the page on screen while moving to another', () => {
        const onSecondPage = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }, answer(rows(3, 4))]).model

        const { model } = run(onSecondPage, [
            { tag: 'nextPageRequested' },
            { tag: 'previousPageRequested' }
        ])

        // Back from page 2, the one on screen, not from page 3, the one that was loading
        expect(pendingRequest(model.table)?.query.cursors).toEqual([])
        expect(model.table.tag).toBe('paging')
        expect(hasNextPage(model.table)).toBe(false)
    })

    it('does not move to another page while already moving', () => {
        const { requests } = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }, { tag: 'nextPageRequested' }])

        expect(requests).toHaveLength(1)
    })

    it('goes back from a page being refreshed, as from the rows on screen', () => {
        const onSecondPage = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }, answer(rows(3, 4))]).model

        const { model } = run(onSecondPage, [{ tag: 'refreshRequested' }, { tag: 'previousPageRequested' }])

        // The refresh asked for the page on screen, so going back moves away from those rows
        expect(model.table.tag).toBe('paging')
        expect(pendingRequest(model.table)?.query.cursors).toEqual([])
    })

    it('goes back from a page of new filters still loading', () => {
        const onSecondPage = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }, answer(rows(3, 4))]).model

        const { model } = run(onSecondPage, [{ tag: 'rowsPerPageChanged', rowsPerPage: 3 }, { tag: 'previousPageRequested' }])

        // The new query is on its first page already: there is none before it
        expect(pendingRequest(model.table)?.query).toMatchObject({ cursors: [], rowsPerPage: 3 })
        expect(hasPreviousPage(model.table)).toBe(false)
    })

    it('applies rows per page another tab persists while moving to another page, from the first page', () => {
        const { model } = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }, loaded({ rowsPerPage: 3 })])

        expect(model.table.tag).toBe('loading')
        expect(pendingRequest(model.table)?.query).toMatchObject({ cursors: [], rowsPerPage: 3 })
    })

    it('goes back to the first page when the ordering or rows per page change', () => {
        const onSecondPage = run(loadedFirstPage(), [{ tag: 'nextPageRequested' }, answer(rows(3, 4))]).model

        const reordered = run(onSecondPage, [{ tag: 'orderingChanged', ordering: { field: 'id', direction: 'DESC' } }]).model
        expect(pendingRequest(reordered.table)?.query).toMatchObject({ cursors: [], ordering: { field: 'id', direction: 'DESC' } })

        const resized = run(onSecondPage, [{ tag: 'rowsPerPageChanged', rowsPerPage: 3 }])
        expect(pendingRequest(resized.model.table)?.query).toMatchObject({ cursors: [], rowsPerPage: 3 })
        expect(resized.commands).toEqual([{ tag: 'persistRowsPerPage', viewId: 'payments', rowsPerPage: 3 }])
    })

    it('does not refetch for an ordering that did not change', () => {
        const { requests } = run(loadedFirstPage(), [{ tag: 'orderingChanged', ordering: null }])

        expect(requests).toHaveLength(0)
    })

    it('applies rows per page another tab persists, from the first page', () => {
        const { requests } = run(loadedFirstPage(), [
            { tag: 'nextPageRequested' }, answer(rows(3, 4)),
            loaded({ rowsPerPage: 3 })
        ])

        expect(requests.map(r => [r.query.cursors.length, r.query.rowsPerPage])).toEqual([[1, 2], [0, 3]])
    })
})

describe('persisting filter state', () => {
    it('persists what the user applies, but not what is already persisted', () => {
        const { commands } = start(
            loaded({ persistedFilterState: emailFilter('restored') }),
            { tag: 'filtersApplied', filters: emailFilter('restored') },
            { tag: 'filtersApplied', filters: emailFilter('new') },
            { tag: 'filtersApplied', filters: emailFilter('new') }
        )

        expect(commands.map(c => c.tag === 'persistFilterState' ? emailOf(c.filters) : c.tag)).toEqual(['new'])
    })

    it('never persists a restored filter state', () => {
        const { commands } = start(userDataArrives(), loaded({ persistedFilterState: emailFilter('remote') }), answer(rows(1)))

        expect(commands).toEqual([])
    })

    it('does not persist when syncing is off', () => {
        const { commands } = start(userDataArrives({ syncFilterState: false }), { tag: 'filtersApplied', filters: emailFilter('a') })

        expect(commands).toEqual([])
    })
})

describe('persisting the ordering', () => {
    const byAmount = { field: 'amount', direction: 'DESC' } as const
    const byId = { field: 'id', direction: 'ASC' } as const

    it('includes the persisted ordering in the first request', () => {
        const { requests } = start(userDataArrives(), loaded({ ordering: byAmount }))

        expect(requests.map(r => r.query.ordering)).toEqual([byAmount])
    })

    it('ignores a persisted ordering by a field the view does not order by', () => {
        const { requests } = start(loaded({ ordering: { field: 'removed', direction: 'ASC' } }))

        expect(requests.map(r => r.query.ordering)).toEqual([null])
    })

    it('ignores the persisted ordering when persisting it is off', () => {
        const { requests } = start(loaded({ syncOrdering: false, ordering: byAmount }))

        expect(requests.map(r => r.query.ordering)).toEqual([null])
    })

    it('persists the ordering the user picks, removing it too', () => {
        const { commands } = start(
            loaded(),
            answer(rows(1)),
            { tag: 'orderingChanged', ordering: byAmount },
            { tag: 'orderingChanged', ordering: null }
        )

        expect(commands).toEqual([
            { tag: 'persistOrdering', viewId: 'payments', ordering: byAmount },
            { tag: 'persistOrdering', viewId: 'payments', ordering: null }
        ])
    })

    it('does not persist when persisting is off, nor before the user data arrives', () => {
        expect(start({ tag: 'orderingChanged', ordering: byAmount }).commands).toEqual([])
        expect(start(loaded({ syncOrdering: false }), { tag: 'orderingChanged', ordering: byAmount }).commands).toEqual([])
    })

    it('does not undo an ordering change with a re-read that still holds the previous one', () => {
        const { model, requests } = start(
            loaded({ ordering: byAmount }),
            answer(rows(1)),
            { tag: 'orderingChanged', ordering: byId },
            loaded({ ordering: byAmount, persistedFilterState: emailFilter('written') }),
            loaded({ ordering: byId, persistedFilterState: emailFilter('written') })
        )

        expect(requests.map(r => r.query.ordering)).toEqual([byAmount, byId])
        expect(model.orderingByViewId.payments).toEqual(byId)
    })

    it('applies an ordering another tab persists, from the first page, removing it too', () => {
        const { requests } = start(
            loaded(), answer(rows(1, 2)),
            { tag: 'nextPageRequested' }, answer(rows(3, 4)),
            loaded({ ordering: byAmount }),
            answer(rows(1)),
            loaded({ ordering: null })
        )

        expect(requests.map(r => [r.query.cursors.length, r.query.ordering])).toEqual([[0, null], [1, null], [0, byAmount], [0, null]])
    })

    it('persists the ordering on screen when persisting is turned on', () => {
        const { commands } = start(
            loaded({ syncOrdering: false }),
            answer(rows(1)),
            { tag: 'orderingChanged', ordering: byAmount },
            loaded({ syncOrdering: true })
        )

        expect(commands).toEqual([{ tag: 'persistOrdering', viewId: 'payments', ordering: byAmount }])
    })
})

describe('switching views', () => {
    it('starts the other view from its own user data, with nothing on screen', () => {
        const { model, requests } = start(
            loaded(),
            answer(rows(1)),
            { tag: 'viewSelected', viewId: 'refunds' },
            loaded({ persistedFilterState: emailFilter('refunds') }, 'refunds')
        )

        expect(requests.map(r => [r.query.viewId, emailOf(r.query.filters)])).toEqual([['payments', undefined], ['refunds', 'refunds']])
        expect(shownPage(model.table)).toBeNull()
    })

    it('ignores user data sent for the view it left', () => {
        const { model } = start(loaded(), { tag: 'viewSelected', viewId: 'refunds' }, loaded())

        expect(model.table.tag).toBe('hydrating')
    })

    it('remembers each view\'s ordering', () => {
        const desc = { field: 'id', direction: 'DESC' } as const
        const { model } = start(
            loaded(),
            { tag: 'orderingChanged', ordering: desc },
            { tag: 'viewSelected', viewId: 'refunds' },
            loaded({}, 'refunds'),
            { tag: 'viewSelected', viewId: 'payments' },
            loaded()
        )

        expect(pendingRequest(model.table)?.query.ordering).toEqual(desc)
    })
})

describe('the filter panel', () => {
    const groups = (viewId: ViewId): FilterGroups => [
        {
            name: 'default',
            label: 'Default',
            filters: [{ id: `${viewId}-email`, label: 'Email', expression: { type: 'isNull', field: 'email', value: { type: 'text' } }, aiGenerated: false }]
        },
        {
            name: 'extra',
            label: 'Extra Filters',
            filters: [{ id: `${viewId}-phone`, label: 'Phone Number', expression: { type: 'isNull', field: 'phone', value: { type: 'text' } }, aiGenerated: false }]
        }
    ] as FilterGroups
    const panelEnv: AppStateEnv = { ...env, filterGroups: groups }
    const send = (state: AppState, ...msgs: Msg[]) => msgs.reduce((current, msg) => updateAppState(panelEnv, current, msg)[0], state)
    const initial = () => initAppState(panelEnv, options())

    it('starts with every group collapsed', () => {
        expect(initial().filterDisplayState).toEqual({ type: 'all', expandedGroups: [] })
    })

    it('shows the filters a search matches, with their groups expanded', () => {
        const state = send(initial(), { tag: 'searchQueryChanged', searchQuery: 'Phone' })

        expect(state.filterDisplayState.type).toBe('searchResults')
        if (state.filterDisplayState.type !== 'searchResults') throw new Error('Expected searchResults display state')
        expect(state.filterDisplayState.filterGroups.flatMap(g => g.filters).map(f => f.id)).toEqual(['payments-phone'])
        expect(state.filterDisplayState.expandedGroups).toEqual(['extra'])
    })

    it('collapses every group again when the search is cleared', () => {
        const state = send(
            initial(),
            { tag: 'filterGroupExpandedChanged', groupName: 'extra', expanded: true },
            { tag: 'searchQueryChanged', searchQuery: '' }
        )

        expect(state.filterDisplayState).toEqual({ type: 'all', expandedGroups: [] })
    })

    it('starts another view afresh, keeping the search', () => {
        const state = send(
            initial(),
            { tag: 'filterGroupExpandedChanged', groupName: 'default', expanded: true },
            { tag: 'searchQueryChanged', searchQuery: 'Email' },
            { tag: 'viewSelected', viewId: 'refunds' }
        )

        expect(state.searchQuery).toBe('Email')
        expect(state.filterDisplayState).toEqual({
            type: 'searchResults',
            filterGroups: [{ ...groups('refunds')[0] }],
            // 'default' was expanded on the view left; a search never expands it
            expandedGroups: []
        })
        expect([...state.filterState.keys()]).toEqual(['refunds-email', 'refunds-phone'])
    })
})

describe('the UI around the table', () => {
    const send = (state: AppState, ...msgs: Msg[]) => msgs.reduce((current, msg) => updateAppState(env, current, msg)[0], state)
    const initial = () => initAppState(env, options())

    it('shows one panel at a time, and hides the one shown when toggled again', () => {
        expect(send(initial(), { tag: 'panelToggled', panel: 'filters' }, { tag: 'panelToggled', panel: 'preferences' }).activePanel).toBe('preferences')
        expect(send(initial(), { tag: 'panelToggled', panel: 'filters' }, { tag: 'panelToggled', panel: 'filters' }).activePanel).toBeNull()
    })

    it('hiding the filters leaves another panel shown', () => {
        const state = send(initial(), { tag: 'panelToggled', panel: 'savedFilters' }, { tag: 'filterPanelShown', shown: false })

        expect(state.activePanel).toBe('savedFilters')
    })

    it('shows the filters a search is typed for, and leaves them shown once it is cleared', () => {
        const searching = send(initial(), { tag: 'panelToggled', panel: 'preferences' }, { tag: 'searchQueryChanged', searchQuery: 'email' })
        expect(searching.activePanel).toBe('filters')

        expect(send(searching, { tag: 'searchQueryChanged', searchQuery: '' }).activePanel).toBe('filters')
    })

    it('clears the selection when switching views', () => {
        const state = send(initial(), { tag: 'rowsSelected', rows: [{ id: 1 }] }, { tag: 'viewSelected', viewId: 'refunds' })

        expect(state.selectedRows).toEqual([])
    })
})

describe('what the types rule out', () => {
    it('compiles only programs that respect the lifecycle', () => {
        const model = initAppState(env, options())

        // @ts-expect-error A request id is minted by `updateAppState`, never made up
        const madeUp: RequestId = 1

        // @ts-expect-error A hydrating table has no request: the state has to be narrowed first
        const notNarrowed = model.table.request

        if (model.table.tag === 'loaded') {
            // @ts-expect-error Rows on screen come with the query they answer, never on their own
            const withoutQuery: typeof model.table.page = { rows: rows(1) }
            void withoutQuery
        }

        void madeUp
        void notNarrowed
        expect(model.table.tag).toBe('hydrating')
    })
})

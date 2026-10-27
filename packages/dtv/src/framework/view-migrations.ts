import type { DataOrdering } from './data-ordering';
import type { Json } from './decoder';
import type { FilterId } from './filters';
import { BASELINE_DEFINITION_REVISION, defaultUndecodedViewData, type UndecodedFilterFormState, type UndecodedFilterState, type UndecodedFilterValue, type UndecodedViewData } from './user-data-undecoded';
import { projectionsEqual, type FilterProjection, type ViewProjection } from './view-projection';

/*
 * View-level migrations: take the user data stored for a view from one revision of the
 * view's definition to the next.
 *
 * A migration is a list of operations between two snapshots (projections) of the
 * definition. Every operation has two sides: what it does to the older snapshot
 * (`applySchema`), and what it does to stored user data (`applyToViewData`). Replaying the
 * schema sides over the older snapshot has to give the newer one — that is how a check can
 * tell a migration covers every change — and the state sides are what runs on user data.
 *
 * The typed way to write migrations is `defineMigration` in dsl/migrations.
 */

/** Returned by a `custom` migration to reset the filter instead. */
export const RESET: unique symbol = Symbol('dtv.migrations.reset')

/** Returned by a `mapValues` function to clear the value instead. */
export const DROP: unique symbol = Symbol('dtv.migrations.drop')

export type MigrationOp =
    | { readonly kind: 'renameFilter'; readonly from: FilterId; readonly to: FilterId }
    | { readonly kind: 'keep'; readonly filterId: FilterId; readonly because: string }
    | { readonly kind: 'reset'; readonly filterId: FilterId }
    | { readonly kind: 'drop'; readonly filterId: FilterId }
    | { readonly kind: 'mapValues'; readonly filterId: FilterId; readonly map: (value: Json) => Json | typeof DROP }
    | { readonly kind: 'mapOperators'; readonly filterId: FilterId; readonly map: Readonly<Record<string, string | null>> }
    | {
        readonly kind: 'custom';
        readonly from: FilterId;
        readonly to: FilterId;
        readonly migrate: (state: UndecodedFilterFormState) => UndecodedFilterFormState | typeof RESET;
    }
    | { readonly kind: 'renameColumn'; readonly from: string; readonly to: string }
    | { readonly kind: 'dropColumn'; readonly columnId: string }
    /** The column sorts by another field: a stored sort by its old field is reset. */
    | { readonly kind: 'resetSort'; readonly columnId: string }
    /** A decision left open by `dtv definitions snapshot`. Fails the check; at runtime it resets `subject` if it is a filter. */
    | { readonly kind: 'todo'; readonly subject: string; readonly message: string }

export type ViewMigration = {
    readonly from: ViewProjection
    readonly to: ViewProjection
    readonly ops: readonly MigrationOp[]
}

/** The snapshots of a view definition, oldest first, and the migrations between them. */
export type ViewMigrationChain = {
    readonly baseline: ViewProjection
    readonly migrations: readonly ViewMigration[]
    /** The current revision of the definition. */
    readonly latest: ViewProjection
}

/** Checks that the migrations follow on from each other, starting at `baseline`. */
export function viewMigrationChain(baseline: ViewProjection, migrations: readonly ViewMigration[]): ViewMigrationChain {
    let latest = baseline
    for (const migration of migrations) {
        if (migration.from.revision !== latest.revision || migration.from.definition !== latest.definition) {
            throw new Error(
                `View migrations of "${baseline.definition}" do not follow on: a migration from revision ${migration.from.revision}` +
                ` of "${migration.from.definition}" comes after revision ${latest.revision} of "${latest.definition}"`
            )
        }
        if (migration.to.revision <= migration.from.revision) {
            throw new Error(`View migration of "${migration.from.definition}" goes from revision ${migration.from.revision} to ${migration.to.revision}`)
        }
        latest = migration.to
    }
    return { baseline, migrations, latest }
}

/* The schema side */

function withOperatorsMapped(from: FilterProjection, to: FilterProjection | undefined): FilterProjection {
    if (to === undefined) return from
    if (from.kind === 'leaf' && to.kind === 'leaf') {
        if (from.control.type !== 'customOperator' || to.control.type !== 'customOperator') return from
        return { ...from, control: { ...from.control, operators: to.control.operators } }
    }
    if (from.kind === 'not' && to.kind === 'not') return { ...from, child: withOperatorsMapped(from.child, to.child) }
    if ((from.kind === 'and' || from.kind === 'or') && to.kind === from.kind && to.children.length === from.children.length) {
        return { ...from, children: from.children.map((child, index) => withOperatorsMapped(child, to.children[index])) }
    }
    return from
}

function omit<T>(record: { readonly [key: string]: T }, key: string): { [key: string]: T } {
    return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))
}

/** What `op` does to the item values of the snapshot `projection` of a migration to `to`. */
function applyToItems(op: MigrationOp, items: NonNullable<ViewProjection['items']>, to: ViewProjection): ViewProjection['items'] {
    const takeFromTo = (filterId: FilterId) => to.items?.[filterId] === undefined
        ? omit(items, filterId)
        : { ...items, [filterId]: to.items[filterId] }

    switch (op.kind) {
        case 'renameFilter':
            return items[op.from] === undefined ? items : { ...omit(items, op.from), [op.to]: items[op.from] }
        case 'keep':
        case 'reset':
        case 'mapValues':
            return takeFromTo(op.filterId)
        case 'drop':
            return omit(items, op.filterId)
        case 'custom': {
            const rest = omit(items, op.from)
            return to.items?.[op.to] === undefined ? rest : { ...rest, [op.to]: to.items[op.to] }
        }
        default:
            return items
    }
}

/** What `op` does to the snapshot `projection` of a migration to `to`. */
export function applySchema(op: MigrationOp, projection: ViewProjection, to: ViewProjection): ViewProjection {
    const result = applyToFiltersAndColumns(op, projection, to)
    return projection.items === undefined ? result : { ...result, items: applyToItems(op, projection.items, to) }
}

function applyToFiltersAndColumns(op: MigrationOp, projection: ViewProjection, to: ViewProjection): ViewProjection {
    const filters = projection.filters
    const columns = projection.columns
    const withFilters = (next: ViewProjection['filters']): ViewProjection => ({ ...projection, filters: next })
    const withColumns = (next: ViewProjection['columns']): ViewProjection => ({ ...projection, columns: next })
    const takeFromTo = (filterId: FilterId) => to.filters[filterId] === undefined
        ? omit(filters, filterId)
        : { ...filters, [filterId]: to.filters[filterId] }

    switch (op.kind) {
        case 'renameFilter':
            return filters[op.from] === undefined ? projection : withFilters({ ...omit(filters, op.from), [op.to]: filters[op.from] })
        case 'keep':
        case 'reset':
            return withFilters(takeFromTo(op.filterId))
        case 'drop':
            return withFilters(omit(filters, op.filterId))
        case 'mapValues':
            return projection
        case 'mapOperators':
            return filters[op.filterId] === undefined
                ? projection
                : withFilters({ ...filters, [op.filterId]: withOperatorsMapped(filters[op.filterId], to.filters[op.filterId]) })
        case 'custom':
            return withFilters({ ...omit(filters, op.from), ...(to.filters[op.to] === undefined ? {} : { [op.to]: to.filters[op.to] }) })
        case 'renameColumn':
            return columns[op.from] === undefined ? projection : withColumns({ ...omit(columns, op.from), [op.to]: columns[op.from] })
        case 'dropColumn':
            return withColumns(omit(columns, op.columnId))
        case 'resetSort':
            return to.columns[op.columnId] === undefined ? projection : withColumns({ ...columns, [op.columnId]: to.columns[op.columnId] })
        case 'todo':
            return projection
    }
}

export type MigrationProblem = { readonly message: string }

const includes = (values: readonly Json[], value: Json) => values.some(other => projectionsEqual(other, value))

const describeValues = (values: readonly Json[]) => values.map(value => JSON.stringify(value)).join(', ')

/** What a `mapValues` mapping does wrong with `values`, which it is given, when `to` knows the values it may give. */
function checkValueMapping(op: Extract<MigrationOp, { kind: 'mapValues' }>, values: readonly Json[], to: readonly Json[], where: string): MigrationProblem[] {
    return values.flatMap(value => {
        let mapped: Json | typeof DROP
        try {
            mapped = op.map(value)
        } catch (err) {
            return [{ message: `${where}: mapValues of "${op.filterId}" fails for ${JSON.stringify(value)}: ${err instanceof Error ? err.message : String(err)}` }]
        }
        return mapped === DROP || includes(to, mapped)
            ? []
            : [{ message: `${where}: mapValues of "${op.filterId}" maps ${JSON.stringify(value)} to ${JSON.stringify(mapped)}, which is not among its items (${describeValues(to)})` }]
    })
}

/**
 * What `migration` leaves uncovered: replaying its operations over the older snapshot has
 * to give the newer one, except for filters and columns the newer one adds. Item values are
 * compared where both snapshots have them: what may be stored for a filter has to stay among
 * its items, or be mapped to them. Undecided `todo`s are problems too.
 */
export function checkMigration(migration: ViewMigration): MigrationProblem[] {
    const { from, to } = migration
    const problems: MigrationProblem[] = []
    const where = `migration of "${to.definition}" to revision ${to.revision}`

    for (const op of migration.ops) {
        if (op.kind === 'todo') problems.push({ message: `${where}: undecided for "${op.subject}": ${op.message}` })
    }

    const expected = migration.ops.reduce((projection, op) => {
        const values = op.kind === 'mapValues' ? projection.items?.[op.filterId] : undefined
        const toValues = op.kind === 'mapValues' ? to.items?.[op.filterId] : undefined
        if (op.kind === 'mapValues' && values !== undefined && toValues !== undefined) {
            problems.push(...checkValueMapping(op, values, toValues, where))
        }
        return applySchema(op, projection, to)
    }, from)

    for (const [filterId, filter] of Object.entries(expected.filters)) {
        if (to.filters[filterId] === undefined) {
            problems.push({ message: `${where}: filter "${filterId}" was removed; drop, rename or migrate it` })
        } else if (!projectionsEqual(filter, to.filters[filterId])) {
            problems.push({ message: `${where}: filter "${filterId}" changed; keep, reset or migrate it` })
        }
    }
    for (const [columnId, column] of Object.entries(expected.columns)) {
        if (to.columns[columnId] === undefined) {
            problems.push({ message: `${where}: column "${columnId}" was removed; drop or rename it` })
        } else if (!projectionsEqual(column, to.columns[columnId])) {
            problems.push({ message: `${where}: column "${columnId}" sorts differently; reset its sort` })
        }
    }
    for (const [filterId, values] of Object.entries(expected.items ?? {})) {
        const toValues = to.items?.[filterId]
        if (toValues === undefined || to.filters[filterId] === undefined) continue
        const removed = values.filter(value => !includes(toValues, value))
        if (removed.length > 0) {
            problems.push({ message: `${where}: filter "${filterId}" no longer has the items ${describeValues(removed)}; map them with mapValues, or reset it` })
        }
    }

    return problems
}

/* The state side */

/** A filter state as migrated so far, and the filters reset in it. */
type FilterStateMigration = { state: UndecodedFilterState; reset: FilterId[] }

function mapLeaves(node: UndecodedFilterFormState, f: (value: UndecodedFilterValue) => UndecodedFilterValue): UndecodedFilterFormState {
    switch (node.type) {
        case 'leaf':
            return { ...node, value: f(node.value) }
        case 'not':
            return { ...node, child: mapLeaves(node.child, f) }
        case 'and':
        case 'or':
            return { ...node, children: node.children.map(child => mapLeaves(child, f)) }
    }
}

/** Maps a leaf's value, or each element of a list (e.g. a multiselect's) on its own. */
function storedOf(value: UndecodedFilterValue): Json | undefined {
    return value.type === 'value' ? value.value : value.type === 'legacy' ? value.raw : undefined
}

/** Whether mapping a filter state's leaves (`before` to `after`, same shape) cleared a value or dropped some of a list. */
function lostValues(before: UndecodedFilterFormState, after: UndecodedFilterFormState): boolean {
    if (before.type === 'leaf' && after.type === 'leaf') {
        if (before.value.type === 'empty') return false
        if (after.value.type === 'empty') return true
        const [was, is] = [storedOf(before.value), storedOf(after.value)]
        return Array.isArray(was) && Array.isArray(is) && is.length < was.length
    }
    if (before.type === 'not' && after.type === 'not') return lostValues(before.child, after.child)
    if ((before.type === 'and' || before.type === 'or') && (after.type === 'and' || after.type === 'or')) {
        return before.children.some((child, index) => after.children[index] !== undefined && lostValues(child, after.children[index]))
    }
    return false
}

function mapValue(value: UndecodedFilterValue, map: (value: Json) => Json | typeof DROP): UndecodedFilterValue {
    if (value.type === 'empty') return value
    const stored = value.type === 'value' ? value.value : value.raw
    const mapped = Array.isArray(stored)
        ? stored.map(map).filter((element): element is Json => element !== DROP)
        : map(stored)
    if (mapped === DROP || (Array.isArray(mapped) && mapped.length === 0)) return { type: 'empty' }
    return value.type === 'value' ? { type: 'value', value: mapped } : { type: 'legacy', raw: mapped }
}

function mapOperator(value: UndecodedFilterValue, map: Readonly<Record<string, string | null>>): UndecodedFilterValue {
    if (value.type === 'empty') return value
    const operatorAndValue = value.type === 'value' ? value.value : value.raw
    if (typeof operatorAndValue !== 'object' || operatorAndValue === null || Array.isArray(operatorAndValue)) return value
    const operator = operatorAndValue.operator
    if (typeof operator !== 'string' || !Object.prototype.hasOwnProperty.call(map, operator)) return value
    const mappedOperator = map[operator]
    if (mappedOperator === null) return { type: 'empty' }
    const mapped = { ...operatorAndValue, operator: mappedOperator }
    return value.type === 'value' ? { type: 'value', value: mapped } : { type: 'legacy', raw: mapped }
}

/** `map`, leaving values that are not among `values` (when known) as they are. */
function onlyAmong(values: readonly Json[] | undefined, map: (value: Json) => Json | typeof DROP): (value: Json) => Json | typeof DROP {
    return values === undefined ? map : value => includes(values, value) ? map(value) : value
}

function applyToFilterState(op: MigrationOp, from: ViewProjection, to: ViewProjection, { state, reset }: FilterStateMigration): FilterStateMigration {
    const has = (filterId: FilterId) => Object.prototype.hasOwnProperty.call(state, filterId)
    const resetFilter = (filterId: FilterId): FilterStateMigration => has(filterId)
        ? { state: omit(state, filterId), reset: to.filters[filterId] === undefined ? reset : [...reset, filterId] }
        : { state, reset }

    switch (op.kind) {
        case 'renameFilter':
            return has(op.from) ? { state: { ...omit(state, op.from), [op.to]: state[op.from] }, reset } : { state, reset }
        case 'keep':
            return { state, reset }
        case 'reset':
            return resetFilter(op.filterId)
        case 'todo':
            console.error(`A view migration to revision ${to.revision} of "${to.definition}" was left undecided for "${op.subject}" (${op.message})`)
            return resetFilter(op.subject)
        case 'drop':
            return { state: omit(state, op.filterId), reset }
        case 'mapValues':
        case 'mapOperators': {
            if (!has(op.filterId)) return { state, reset }
            const before = state[op.filterId]
            const after = op.kind === 'mapValues'
                ? mapLeaves(before, value => mapValue(value, onlyAmong(from.items?.[op.filterId], op.map)))
                : mapLeaves(before, value => mapOperator(value, op.map))
            // A value mapped away is lost to the user as much as a reset filter is: they are told.
            return { state: { ...state, [op.filterId]: after }, reset: lostValues(before, after) ? [...reset, op.filterId] : reset }
        }
        case 'custom': {
            if (!has(op.from)) return { state, reset }
            const rest = omit(state, op.from)
            let migrated: UndecodedFilterFormState | typeof RESET
            try {
                migrated = op.migrate(state[op.from])
            } catch (err) {
                console.error(`A view migration to revision ${to.revision} of "${to.definition}" failed for filter "${op.from}"; resetting the filter:`, err)
                migrated = RESET
            }
            return migrated === RESET
                ? { state: rest, reset: [...reset, op.to] }
                : { state: { ...rest, [op.to]: migrated }, reset }
        }
        case 'renameColumn':
        case 'dropColumn':
        case 'resetSort':
            return { state, reset }
    }
}

function migrateFilterStateOnce(migration: ViewMigration, state: UndecodedFilterState): FilterStateMigration {
    return migration.ops.reduce(
        (migrated, op) => applyToFilterState(op, migration.from, migration.to, migrated),
        { state, reset: [] as FilterId[] }
    )
}

function migrateColumnIds(migration: ViewMigration, columnIds: string[]): string[] {
    return migration.ops.reduce((ids, op) => {
        switch (op.kind) {
            case 'renameColumn':
                return ids.map(id => id === op.from ? op.to : id)
            case 'dropColumn':
                return ids.filter(id => id !== op.columnId)
            default:
                return ids
        }
    }, columnIds)
}

/** The stored ordering, unless it sorts by what a dropped column, or one sorting by another field now, sorted by. */
function migrateOrdering(migration: ViewMigration, ordering: DataOrdering | null): DataOrdering | null {
    return migration.ops.reduce<DataOrdering | null>((current, op) => {
        if (current === null || (op.kind !== 'dropColumn' && op.kind !== 'resetSort')) return current
        return migration.from.columns[op.columnId]?.orderBy === current.field ? null : current
    }, ordering)
}

/** Filters reset by migrations, or that lost stored values to them (`mapValues`, `mapOperators`), where they were stored. */
export type MigrationResets = {
    persistedFilterState: FilterId[]
    savedFilters: Array<{ name: string; filterIds: FilterId[] }>
}

export type ViewDataMigration = { data: UndecodedViewData; resets: MigrationResets }

/** Applies one migration's state side to a view's stored data. */
export function applyToViewData(migration: ViewMigration, data: UndecodedViewData): ViewDataMigration {
    const persisted = data.persistedFilterState === null ? null : migrateFilterStateOnce(migration, data.persistedFilterState)
    const savedFilters = data.savedFilters.map(savedFilter => ({ savedFilter, migrated: migrateFilterStateOnce(migration, savedFilter.state) }))

    return {
        data: {
            ...data,
            columnOrder: data.columnOrder === null ? null : migrateColumnIds(migration, data.columnOrder),
            hiddenColumns: migrateColumnIds(migration, data.hiddenColumns),
            ordering: migrateOrdering(migration, data.ordering),
            persistedFilterState: persisted?.state ?? null,
            savedFilters: savedFilters.map(({ savedFilter, migrated }) => ({ ...savedFilter, state: migrated.state })),
            definitionRevision: migration.to.revision
        },
        resets: {
            persistedFilterState: persisted?.reset ?? [],
            savedFilters: savedFilters
                .filter(({ migrated }) => migrated.reset.length > 0)
                .map(({ savedFilter, migrated }) => ({ name: savedFilter.name, filterIds: migrated.reset }))
        }
    }
}

export function mergeResets(left: MigrationResets, right: MigrationResets): MigrationResets {
    const savedFilters = new Map(left.savedFilters.map(savedFilter => [savedFilter.name, savedFilter.filterIds]))
    for (const { name, filterIds } of right.savedFilters) {
        savedFilters.set(name, [...new Set([...(savedFilters.get(name) ?? []), ...filterIds])])
    }
    return {
        persistedFilterState: [...new Set([...left.persistedFilterState, ...right.persistedFilterState])],
        savedFilters: [...savedFilters].map(([name, filterIds]) => ({ name, filterIds }))
    }
}

export const noResets = (): MigrationResets => ({ persistedFilterState: [], savedFilters: [] })

/**
 * Takes a view's stored data from the revision it was written for to the chain's latest.
 * Data at or past the latest revision is returned as it is.
 */
export function migrateViewData(chain: ViewMigrationChain, data: UndecodedViewData): ViewDataMigration {
    return chain.migrations
        .filter(migration => migration.from.revision >= data.definitionRevision)
        .reduce(
            (migrated, migration) => {
                const next = applyToViewData(migration, migrated.data)
                return { data: next.data, resets: mergeResets(migrated.resets, next.resets) }
            },
            { data, resets: noResets() }
        )
}

/**
 * Drops the stored state of filters whose definition differs from the chain's latest
 * snapshot: the definition changed and no migration was generated for it yet, so the
 * stored state cannot be trusted to fit.
 */
export function resetFiltersChangedSinceSnapshot(
    latest: ViewProjection,
    live: ViewProjection,
    data: UndecodedViewData
): ViewDataMigration {
    const changed = Object.keys(live.filters).filter(filterId =>
        latest.filters[filterId] !== undefined && !projectionsEqual(latest.filters[filterId], live.filters[filterId])
    )
    if (changed.length === 0) return { data, resets: noResets() }

    const dropChanged = (state: UndecodedFilterState): FilterStateMigration => ({
        state: Object.fromEntries(Object.entries(state).filter(([filterId]) => !changed.includes(filterId))),
        reset: changed.filter(filterId => Object.prototype.hasOwnProperty.call(state, filterId))
    })
    const persisted = data.persistedFilterState === null ? null : dropChanged(data.persistedFilterState)
    const savedFilters = data.savedFilters.map(savedFilter => ({ savedFilter, migrated: dropChanged(savedFilter.state) }))

    return {
        data: {
            ...data,
            persistedFilterState: persisted?.state ?? null,
            savedFilters: savedFilters.map(({ savedFilter, migrated }) => ({ ...savedFilter, state: migrated.state }))
        },
        resets: {
            persistedFilterState: persisted?.reset ?? [],
            savedFilters: savedFilters
                .filter(({ migrated }) => migrated.reset.length > 0)
                .map(({ savedFilter, migrated }) => ({ name: savedFilter.name, filterIds: migrated.reset }))
        }
    }
}

/** The revision of the definition user data is written for; without migrations, the baseline. */
export function currentDefinitionRevision(chain: ViewMigrationChain | undefined): number {
    return chain?.latest.revision ?? BASELINE_DEFINITION_REVISION
}

/** A single filter state (e.g. a shared one) taken from `revision` to the chain's latest. */
export function migrateFilterState(chain: ViewMigrationChain, revision: number, state: UndecodedFilterState): UndecodedFilterState {
    const asViewData: UndecodedViewData = {
        ...defaultUndecodedViewData(),
        persistedFilterState: state,
        definitionRevision: revision
    }
    return migrateViewData(chain, asViewData).data.persistedFilterState ?? {}
}

/** The definition ids older snapshots had, latest first, other than the latest's. */
export function previousDefinitions(chain: ViewMigrationChain): string[] {
    const definitions = [chain.baseline, ...chain.migrations.map(migration => migration.to)]
        .map(projection => projection.definition)
        .reverse()
    return [...new Set(definitions)].filter(definition => definition !== chain.latest.definition)
}

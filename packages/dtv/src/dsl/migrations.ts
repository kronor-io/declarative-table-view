import type { Json } from '../framework/decoder';
import {
    DROP,
    RESET,
    viewMigrationChain,
    type MigrationOp,
    type ViewMigration,
    type ViewMigrationChain
} from '../framework/view-migrations';
import type { UndecodedFilterFormState } from '../framework/user-data-undecoded';
import type { ViewProjection } from '../framework/view-projection';
import type { DslTypeError } from './typeErrors';

/*
 * Typed view-level migrations. `dtv definitions snapshot` writes these; edit them where it leaves
 * a `todo`. Every operation is checked against the two snapshots it migrates between: ids
 * have to exist in the right snapshot, renamed filters have to keep their shape, and so on.
 *
 *     export default defineMigration(v3, v4, m => [
 *         m.renameFilter('amt', 'amount'),
 *         m.keep('createdAt', { because: 'the GraphQL field was renamed; same values' }),
 *         m.mapOperators('reference', { _like: '_ilike' }),
 *     ])
 */

export { DROP, RESET } from '../framework/view-migrations';
export type { ViewMigration, ViewMigrationChain } from '../framework/view-migrations';
export type { ViewProjection } from '../framework/view-projection';

type FilterIdOf<P extends ViewProjection> = Extract<keyof P['filters'], string>
type ColumnIdOf<P extends ViewProjection> = Extract<keyof P['columns'], string>

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assignable<A, B> = [A] extends [B] ? true : false
type Check<Ok extends boolean, Message extends string> = Ok extends true ? unknown : DslTypeError<Message>

/* Stored filter state, typed by the snapshot of the filter it was stored for */

type OperatorsOfControl<C> = C extends { type: 'customOperator'; operators: readonly (infer O)[] } ? O : never

/** The custom operators a filter's controls offer. */
export type OperatorsOf<F> =
    F extends { kind: 'leaf'; control: infer C } ? OperatorsOfControl<C>
    : F extends { kind: 'and' | 'or'; children: readonly (infer Child)[] } ? OperatorsOf<Child>
    : F extends { kind: 'not'; child: infer Child } ? OperatorsOf<Child>
    : never

type LeafValueFor<C> = C extends { type: 'customOperator'; operators: readonly (infer O)[] }
    ? { operator: O; value: { type: 'empty' } | { type: 'value'; value: Json } }
    : Json

/** A stored leaf value of a filter with the control `C`. */
export type UndecodedFilterValueFor<C> =
    | { type: 'empty' }
    | { type: 'value'; value: LeafValueFor<C> }
    | { type: 'legacy'; raw: Json }

/** A filter's stored state, for the filter's snapshot `F`. */
export type UndecodedFilterFormStateFor<F> =
    F extends { kind: 'leaf'; control: infer C } ? { type: 'leaf'; value: UndecodedFilterValueFor<C> }
    : F extends { kind: infer K extends 'and' | 'or'; children: infer Children extends readonly unknown[] }
        ? { type: K; children: { -readonly [I in keyof Children]: UndecodedFilterFormStateFor<Children[I]> } }
    : F extends { kind: 'not'; child: infer Child } ? { type: 'not'; child: UndecodedFilterFormStateFor<Child> }
    : never

type StateOf<P extends ViewProjection, Id extends keyof P['filters']> = UndecodedFilterFormStateFor<P['filters'][Id]>

/** The operations of a migration from the snapshot `From` to the snapshot `To`. */
export interface MigrationBuilder<From extends ViewProjection, To extends ViewProjection> {
    /** The filter got another id; it is otherwise the same. */
    renameFilter<A extends FilterIdOf<From>, B extends FilterIdOf<To>>(
        from: A,
        to: B & Check<Same<From['filters'][A], To['filters'][B]>, `renameFilter: "${A}" and "${B}" differ; use custom()`>
    ): MigrationOp

    /** The filter changed, but every state stored for it still fits and means the same. */
    keep<Id extends FilterIdOf<From> & FilterIdOf<To>>(
        id: Id & Check<Assignable<StateOf<From, Id>, StateOf<To, Id>>, `keep: state stored for "${Id}" does not fit it any more; use custom() or reset()`>,
        why: { because: string }
    ): MigrationOp

    /** Drop what is stored for the filter; it starts over from its initial value. Users are told. */
    reset<Id extends FilterIdOf<From>>(id: Id): MigrationOp

    /** The filter was removed. */
    drop<Id extends Exclude<FilterIdOf<From>, FilterIdOf<To>>>(id: Id): MigrationOp

    /**
     * Rewrite the stored values of the filter's leaves, e.g. for renamed enum values. A list
     * (a multiselect's value) is mapped element by element. Return `DROP` to remove a value.
     * Dropdown items are not part of snapshots, so this is checked by nothing but you:
     * `dtv definitions snapshot --manual` makes a revision for it.
     */
    mapValues<Id extends FilterIdOf<From> & FilterIdOf<To>>(id: Id, map: (value: Json) => Json | typeof DROP): MigrationOp

    /** Map each custom operator the filter no longer offers to one it does, or to `null` to clear it. */
    mapOperators<Id extends FilterIdOf<From> & FilterIdOf<To>>(
        id: Id,
        map: { [O in Exclude<OperatorsOf<From['filters'][Id]>, OperatorsOf<To['filters'][Id]>>]: OperatorsOf<To['filters'][Id]> | null }
    ): MigrationOp

    /** Turn what is stored for `from` into a state of `to`, or `RESET`. */
    custom<A extends FilterIdOf<From>, B extends FilterIdOf<To>>(
        from: A,
        to: B,
        migrate: (state: StateOf<From, A>) => StateOf<To, B> | typeof RESET
    ): MigrationOp

    renameColumn<A extends ColumnIdOf<From>, B extends ColumnIdOf<To>>(from: A, to: B): MigrationOp

    dropColumn<Id extends Exclude<ColumnIdOf<From>, ColumnIdOf<To>>>(id: Id): MigrationOp

    /** The column sorts by another field. */
    resetSort<Id extends ColumnIdOf<From> & ColumnIdOf<To>>(id: Id): MigrationOp

    /**
     * A decision left open about `subject` (a filter, a column, …). Does not type-check, on
     * purpose: replace it with one of the operations above.
     */
    todo<const Message extends string>(subject: string, message: Message): DslTypeError<`todo: ${Message}`>
}

/** The builder at runtime: any ids, any states. The types of `MigrationBuilder` check them. */
const untypedBuilder = {
    renameFilter: (from: string, to: string): MigrationOp => ({ kind: 'renameFilter', from, to }),
    keep: (filterId: string, why: { because: string }): MigrationOp => ({ kind: 'keep', filterId, because: why.because }),
    reset: (filterId: string): MigrationOp => ({ kind: 'reset', filterId }),
    drop: (filterId: string): MigrationOp => ({ kind: 'drop', filterId }),
    mapValues: (filterId: string, map: (value: Json) => Json | typeof DROP): MigrationOp => ({ kind: 'mapValues', filterId, map }),
    mapOperators: (filterId: string, map: Record<string, string | null>): MigrationOp => ({ kind: 'mapOperators', filterId, map }),
    custom: (from: string, to: string, migrate: (state: UndecodedFilterFormState) => UndecodedFilterFormState | typeof RESET): MigrationOp =>
        ({ kind: 'custom', from, to, migrate }),
    renameColumn: (from: string, to: string): MigrationOp => ({ kind: 'renameColumn', from, to }),
    dropColumn: (columnId: string): MigrationOp => ({ kind: 'dropColumn', columnId }),
    resetSort: (columnId: string): MigrationOp => ({ kind: 'resetSort', columnId }),
    todo: (subject: string, message: string): MigrationOp => ({ kind: 'todo', subject, message })
}

/** The migration of stored user data from the snapshot `from` to the snapshot `to`. */
export function defineMigration<const From extends ViewProjection, const To extends ViewProjection>(
    from: From,
    to: To,
    ops: (m: MigrationBuilder<From, To>) => readonly MigrationOp[]
): ViewMigration {
    return { from, to, ops: ops(untypedBuilder as unknown as MigrationBuilder<From, To>) }
}

/**
 * A view definition's migrations, from its first snapshot on. Pass the result as the
 * view's `migrations`. Throws when the migrations do not follow on from each other.
 */
export function defineViewMigrations(baseline: ViewProjection, migrations: readonly ViewMigration[] = []): ViewMigrationChain {
    return viewMigrationChain(baseline, migrations)
}

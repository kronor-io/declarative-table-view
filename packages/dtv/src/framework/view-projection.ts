import { getColumnOrderBy } from './column-definition';
import type { FilterControl, FilterExpr } from './filters';
import { getAllFilters, type View } from './view';

/*
 * The part of a view definition that the user data stored for the view depends on: what
 * a filter's stored state has to look like, and what columns exist to hide, order and
 * sort. Labels, initial values, renderers and the like are left out, and so are dropdown
 * and multiselect items: those often come from the database, so they are not part of the
 * definition.
 *
 * Each revision of a view definition is committed as a projection (a snapshot), and
 * view-level migrations take stored user data from one snapshot to the next.
 */

export type ControlProjection =
    | { readonly type: 'text' | 'number' | 'date' | 'dropdown' | 'multiselect' | 'custom' }
    | { readonly type: 'autocomplete'; readonly multiple: boolean }
    | { readonly type: 'customOperator'; readonly operators: readonly string[]; readonly valueControl: ControlProjection }

export type FieldProjection =
    | string
    | { readonly and: readonly string[] }
    | { readonly or: readonly string[] }

export type LeafComparison = Extract<FilterExpr, { field: unknown }>['type']

export type FilterProjection =
    | { readonly kind: 'leaf'; readonly cmp: LeafComparison; readonly field: FieldProjection; readonly control: ControlProjection }
    | { readonly kind: 'and' | 'or'; readonly children: readonly FilterProjection[] }
    | { readonly kind: 'not'; readonly child: FilterProjection }

export type ColumnProjection = {
    /** The field the column sorts by; `null` when it cannot be sorted. */
    readonly orderBy: string | null
}

export type ViewProjection = {
    /** The definition's id: the literal id given to `view()`, which instances may derive their ids from. */
    readonly definition: string
    readonly revision: number
    readonly filters: { readonly [filterId: string]: FilterProjection }
    readonly columns: { readonly [columnId: string]: ColumnProjection }
}

function projectControl(control: FilterControl): ControlProjection {
    switch (control.type) {
        case 'autocomplete':
            return { type: 'autocomplete', multiple: control.multiple === true }
        case 'customOperator':
            return {
                type: 'customOperator',
                operators: control.operators.map(operator => operator.value),
                valueControl: projectControl(control.valueControl)
            }
        default:
            return { type: control.type }
    }
}

export function projectFilter(expression: FilterExpr): FilterProjection {
    switch (expression.type) {
        case 'and':
        case 'or':
            return { kind: expression.type, children: expression.filters.map(projectFilter) }
        case 'not':
            return { kind: 'not', child: projectFilter(expression.filter) }
        default:
            return { kind: 'leaf', cmp: expression.type, field: expression.field, control: projectControl(expression.value) }
    }
}

/** The projection of `view`, as revision `revision` of the definition `definition`. */
export function projectView(view: View, definition: string, revision: number): ViewProjection {
    return {
        definition,
        revision,
        filters: Object.fromEntries(
            getAllFilters(view.filterGroups).map(filter => [filter.id, projectFilter(filter.expression)])
        ),
        columns: Object.fromEntries(
            view.columnDefinitions.flatMap(column => column.type === 'tableColumn'
                ? [[column.id, { orderBy: getColumnOrderBy(column) ?? null }]]
                : [])
        )
    }
}

/** Whether two projections (or parts of them) are the same. Key order does not matter. */
export function projectionsEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true
    if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
    if (Array.isArray(left) !== Array.isArray(right)) return false
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
        && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
            && projectionsEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

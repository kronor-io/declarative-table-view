// Lowering `FieldQuery` ASTs into GraphQL selection sets, plus structural
// de-duplication so several independent consumers of the same row (columns,
// form fields, ...) can contribute overlapping selections without emitting
// duplicate fields.
import {
    hasuraFilterExpressionsAreEqual,
    unorderedArrayEqual,
} from '../hasura/filter-expression.js';
import type { OrderDirection } from '../order-direction.js';
import type { FieldQuery, OrderByConfig, Query } from './ast.js';
import type { GraphQLSelectionSet, GraphQLSelectionSetItem, HasuraOrderBy } from './document.js';

/**
 * Whether two items address the same field with the same arguments, ignoring
 * what they select from it. Items that differ here really are different fields
 * (the same collection filtered two ways, say) and must stay side by side.
 */
function selectionItemsAddressSameField(a: GraphQLSelectionSetItem, b: GraphQLSelectionSetItem): boolean {
    const orderByEqual = (x?: HasuraOrderBy | HasuraOrderBy[], y?: HasuraOrderBy | HasuraOrderBy[]): boolean => {
        if (x === y) return true;
        if (!x || !y) return false;
        const norm = (v: HasuraOrderBy | HasuraOrderBy[]) => Array.isArray(v) ? v.map(o => JSON.stringify(o)).join('|') : JSON.stringify(v);
        return norm(x) === norm(y);
    };

    return a.field === b.field &&
        a.alias === b.alias &&
        a.path === b.path &&
        a.limit === b.limit &&
        a.offset === b.offset &&
        unorderedArrayEqual(a.distinct_on || [], b.distinct_on || [], (x, y) => x === y) &&
        orderByEqual(a.order_by, b.order_by) &&
        ((a.where && b.where) ? hasuraFilterExpressionsAreEqual(a.where, b.where) : a.where === b.where);
}

function selectionItemsEqual(a: GraphQLSelectionSetItem, b: GraphQLSelectionSetItem): boolean {
    const selectionsEqual = (x?: GraphQLSelectionSet, y?: GraphQLSelectionSet): boolean => {
        if (!x && !y) return true;
        if (!x || !y) return false;
        if (x.length !== y.length) return false;
        for (let i = 0; i < x.length; i++) {
            if (!selectionItemsEqual(x[i], y[i])) return false;
        }
        return true;
    };

    return selectionItemsAddressSameField(a, b) && selectionsEqual(a.selections, b.selections);
}

/**
 * Merges one item into a selection set, combining it with an item that
 * addresses the same field rather than appending a second copy of it.
 *
 * This is what a caller needs when its selections come from independent field
 * *paths* — `vendor.name` and `vendor.id` contributed separately should end up
 * as one `vendor { name id }`, not two sibling `vendor` blocks. Callers whose
 * selections already come as complete sub-trees (one per table column, say) do
 * not need it; see `buildSelectionSet`.
 */
export function mergeSelectionSetItem(
    selectionSet: GraphQLSelectionSet,
    item: GraphQLSelectionSetItem,
): GraphQLSelectionSet {
    const existingIndex = selectionSet.findIndex(existing => selectionItemsAddressSameField(existing, item));

    if (existingIndex === -1) {
        return [...selectionSet, item];
    }

    const existing = selectionSet[existingIndex];

    // A field selected both bare and with a sub-selection keeps the
    // sub-selection: the bare form would not be a legal selection anyway.
    const selections = item.selections
        ? item.selections.reduce(mergeSelectionSetItem, existing.selections ?? [])
        : existing.selections;

    const merged: GraphQLSelectionSetItem = selections
        ? { ...existing, selections }
        : { ...existing };

    return [
        ...selectionSet.slice(0, existingIndex),
        merged,
        ...selectionSet.slice(existingIndex + 1),
    ];
}

export type SelectionSetMergeOptions = {
    /**
     * Merge the sub-selections of items addressing the same field instead of
     * keeping them side by side. Off by default, because selections built from
     * complete per-column sub-trees are meant to stay distinct.
     */
    mergeNestedSelections?: boolean;
};

/**
 * Concatenates two selection sets, dropping items from `set2` that are
 * structurally identical to one already in `set1`. Non-identical items are kept
 * side by side rather than deep-merged, unless `mergeNestedSelections` is set.
 */
export function mergeSelectionSets(
    set1: GraphQLSelectionSet,
    set2: GraphQLSelectionSet,
    options?: SelectionSetMergeOptions,
): GraphQLSelectionSet {
    if (options?.mergeNestedSelections) {
        return set2.reduce(mergeSelectionSetItem, set1);
    }

    const merged = [...set1];

    for (const item2 of set2) {
        const duplicate = merged.find(m => selectionItemsEqual(m, item2));
        if (!duplicate) {
            merged.push(item2); // add as-is if not identical
        }
    }
    return merged;
}

function toSelectionSetItem(query: Query, alias?: string): GraphQLSelectionSetItem {
    const item: GraphQLSelectionSetItem = { field: query.field };

    if (alias !== undefined) {
        item.alias = alias;
    }

    if (query.path) {
        item.path = query.path;
    }

    return item;
}

function toHasuraOrderBy(orderBy: OrderByConfig | OrderByConfig[]): HasuraOrderBy | HasuraOrderBy[] {
    const buildOrderByObject = (key: string, direction: OrderDirection): HasuraOrderBy => {
        return key
            .split('.')
            .filter(Boolean)
            .reverse()
            .reduce<HasuraOrderBy | OrderDirection>((acc, pathPart) => ({ [pathPart]: acc }), direction) as HasuraOrderBy;
    };

    if (Array.isArray(orderBy)) {
        return orderBy.map(item => buildOrderByObject(item.key, item.direction.toUpperCase() as OrderDirection));
    }

    return buildOrderByObject(orderBy.key, orderBy.direction.toUpperCase() as OrderDirection);
}

function assertNever(value: never): never {
    throw new Error(`Unhandled query type: ${JSON.stringify(value)}`);
}

function processSelectionSet(selectionSet: readonly Query[]): GraphQLSelectionSet | undefined {
    if (!selectionSet.length) {
        return undefined;
    }

    return selectionSet.map(query => queryToSelectionSetItem(query));
}

/** Lowers a single `Query` node (and its selection set) to a selection item. */
export function queryToSelectionSetItem(query: Query, alias?: string): GraphQLSelectionSetItem {
    switch (query.type) {
        case 'valueQuery':
            return toSelectionSetItem(query, alias);
        case 'objectQuery': {
            const item = toSelectionSetItem(query, alias);
            const selections = processSelectionSet(query.selectionSet);

            if (selections) {
                item.selections = selections;
            }

            return item;
        }
        case 'arrayQuery': {
            const item = toSelectionSetItem(query, alias);

            if (query.orderBy) item.order_by = toHasuraOrderBy(query.orderBy);
            if (query.distinctOn) item.distinct_on = query.distinctOn;
            if (query.limit !== undefined) item.limit = query.limit;
            if (query.where) item.where = query.where;

            const selections = processSelectionSet(query.selectionSet);
            if (selections) {
                item.selections = selections;
            }

            return item;
        }
        default:
            return assertNever(query);
    }
}

/**
 * Lowers a `FieldQuery` to a selection item. `aliasOverride` wins over an
 * alias carried by a `fieldAlias` node.
 */
export function fieldQueryToSelectionSetItem(fieldQuery: FieldQuery, aliasOverride?: string): GraphQLSelectionSetItem {
    switch (fieldQuery.type) {
        case 'fieldAlias':
            return {
                ...fieldQueryToSelectionSetItem(fieldQuery.field),
                alias: aliasOverride ?? fieldQuery.alias,
            };
        case 'valueQuery':
        case 'objectQuery':
        case 'arrayQuery':
            return queryToSelectionSetItem(fieldQuery, aliasOverride);
        default:
            return assertNever(fieldQuery);
    }
}

export type SelectionSetInput = {
    fieldQuery: FieldQuery;
    /** Overrides any alias on the field query itself. */
    alias?: string;
};

/**
 * Builds a de-duplicated selection set from a flat list of field queries.
 *
 * By default only structurally identical selections are collapsed. Pass
 * `mergeNestedSelections` when the inputs are contributed independently and may
 * overlap partially, so that they combine into one selection per field.
 */
export function buildSelectionSet(
    inputs: readonly SelectionSetInput[],
    options?: SelectionSetMergeOptions,
): GraphQLSelectionSet {
    return inputs
        .map(input => fieldQueryToSelectionSetItem(input.fieldQuery, input.alias))
        .reduce<GraphQLSelectionSet>((acc, current) => mergeSelectionSets(acc, [current], options), []);
}

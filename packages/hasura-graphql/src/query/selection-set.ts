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
        unorderedArrayEqual(a.distinct_on || [], b.distinct_on || [], (x, y) => x === y) &&
        orderByEqual(a.order_by, b.order_by) &&
        ((a.where && b.where) ? hasuraFilterExpressionsAreEqual(a.where, b.where) : a.where === b.where) &&
        selectionsEqual(a.selections, b.selections);
}

/**
 * Concatenates two selection sets, dropping items from `set2` that are
 * structurally identical to one already in `set1`. Non-identical items are
 * kept side by side rather than deep-merged.
 */
export function mergeSelectionSets(set1: GraphQLSelectionSet, set2: GraphQLSelectionSet): GraphQLSelectionSet {
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
 */
export function buildSelectionSet(inputs: readonly SelectionSetInput[]): GraphQLSelectionSet {
    return inputs
        .map(input => fieldQueryToSelectionSetItem(input.fieldQuery, input.alias))
        .reduce<GraphQLSelectionSet>((acc, current) => mergeSelectionSets(acc, [current]), []);
}

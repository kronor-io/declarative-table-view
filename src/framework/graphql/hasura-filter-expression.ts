import type { FilterField, FilterGroups, FilterExpr, TransformResult } from '../filters';
import { FilterFormState, traverseFilterSchemaAndState } from '../filter-form-state';
import { FilterState } from '../state';
import { getAllFilters } from '../view';
import * as FilterValue from '../filterValue';
import type { HasuraFilterObject, HasuraOperator } from './hasura-filter-object';
import { hasuraOperatorsAreEqual } from './hasura-filter-object';

export type HasuraFilterExpression =
    | { kind: 'empty' }
    | { kind: 'and'; items: HasuraFilterExpression[] }
    | { kind: 'or'; items: HasuraFilterExpression[] }
    | { kind: 'not'; item: HasuraFilterExpression }
    | { kind: 'where'; path: string[]; operator: HasuraOperator | HasuraOperator[] }
    | { kind: 'scope'; path: string[]; expr: HasuraFilterExpression };

function toPath(path: string | string[]): string[] {
    if (Array.isArray(path)) return path;
    if (!path) return [];
    return path.split('.').filter(Boolean);
}

function nestFilterObject(path: string[], leaf: unknown): HasuraFilterObject {
    if (path.length === 0) return leaf as HasuraFilterObject;
    return path
        .slice()
        .reverse()
        .reduce((acc, key) => ({ [key]: acc }) as any, leaf as any) as HasuraFilterObject;
}

function isEmptyFilterObject(cond: HasuraFilterObject): boolean {
    return typeof cond === 'object' && cond !== null && Object.keys(cond).length === 0;
}

export const Hasura = {
    empty: (): HasuraFilterExpression => ({ kind: 'empty' }),
    and: (...items: HasuraFilterExpression[]): HasuraFilterExpression => ({ kind: 'and', items }),
    or: (...items: HasuraFilterExpression[]): HasuraFilterExpression => ({ kind: 'or', items }),
    not: (item: HasuraFilterExpression): HasuraFilterExpression => ({ kind: 'not', item }),
    condition: (
        path: string | string[],
        operator: HasuraOperator | HasuraOperator[]
    ): HasuraFilterExpression => ({ kind: 'where', path: toPath(path), operator }),
    scope: (path: string | string[], expr: HasuraFilterExpression): HasuraFilterExpression => ({ kind: 'scope', path: toPath(path), expr }),
    eq: (value: unknown): HasuraOperator => ({ _eq: value }),
    neq: (value: unknown): HasuraOperator => ({ _neq: value }),
    gt: (value: unknown): HasuraOperator => ({ _gt: value }),
    lt: (value: unknown): HasuraOperator => ({ _lt: value }),
    gte: (value: unknown): HasuraOperator => ({ _gte: value }),
    lte: (value: unknown): HasuraOperator => ({ _lte: value }),
    in: (value: unknown[]): HasuraOperator => ({ _in: value }),
    nin: (value: unknown[]): HasuraOperator => ({ _nin: value }),
    like: (value: string): HasuraOperator => ({ _like: value }),
    ilike: (value: string): HasuraOperator => ({ _ilike: value }),
    isNull: (value: boolean): HasuraOperator => ({ _is_null: value }),
    similar: (value: string): HasuraOperator => ({ _similar: value }),
    nsimilar: (value: string): HasuraOperator => ({ _nsimilar: value }),
    regex: (value: string): HasuraOperator => ({ _regex: value }),
    nregex: (value: string): HasuraOperator => ({ _nregex: value }),
    iregex: (value: string): HasuraOperator => ({ _iregex: value }),
    niregex: (value: string): HasuraOperator => ({ _niregex: value }),
} as const;

export function hasuraFilterExpressionToObject(expr: HasuraFilterExpression): HasuraFilterObject {
    switch (expr.kind) {
        case 'empty':
            return {};
        case 'where': {
            const path = expr.path;
            if (path.length === 0) return {};
            const field = path[path.length - 1];
            const scope = path.slice(0, -1);
            return nestFilterObject([...scope, field], expr.operator);
        }
        case 'scope': {
            const inner = hasuraFilterExpressionToObject(expr.expr);
            if (isEmptyFilterObject(inner)) return {};
            if (expr.path.length === 0) return inner;
            return nestFilterObject(expr.path, inner);
        }
        case 'not':
            return { _not: hasuraFilterExpressionToObject(expr.item) };
        case 'and': {
            const compiled = expr.items
                .map(hasuraFilterExpressionToObject)
                .filter(c => !isEmptyFilterObject(c));
            if (compiled.length === 0) return {};
            if (compiled.length === 1) return compiled[0];
            return { _and: compiled };
        }
        case 'or': {
            const compiled = expr.items
                .map(hasuraFilterExpressionToObject)
                .filter(c => !isEmptyFilterObject(c));
            if (compiled.length === 0) return {};
            if (compiled.length === 1) return compiled[0];
            return { _or: compiled };
        }
    }
}

// Build Hasura filter expression from FilterFormState and FilterFieldSchema using schema-driven approach
export function buildHasuraConditions(
    filterState: FilterState,
    filterGroups: FilterGroups
): HasuraFilterExpression {
    const filtersById = new Map(getAllFilters(filterGroups)
        .map(filterSchema => [filterSchema.id, filterSchema] as const));

    function buildNestedKey(field: FilterField, operator: HasuraOperator | HasuraOperator[]): HasuraFilterExpression {
        if (typeof field === 'object') {
            if ('and' in field) {
                return Hasura.and(...field.and.map(fieldName => Hasura.condition(fieldName, operator)));
            }
            if ('or' in field) {
                return Hasura.or(...field.or.map(fieldName => Hasura.condition(fieldName, operator)));
            }
        }
        if (typeof field === 'string') {
            return Hasura.condition(field, operator);
        }
        return Hasura.empty();
    }

    function isNonEmptyCustomOperatorValue(
        value: unknown
    ): value is { operator: string; value: FilterValue.FilterValue } {
        if (typeof value !== 'object' || value === null) return false;
        if (!('operator' in value) || typeof (value as any).operator !== 'string') return false;
        if (!('value' in value)) return false;

        const inner = (value as any).value;
        return FilterValue.isValue(inner);
    }

    function buildConditionsRecursive(
        schemaNode: FilterExpr,
        stateNode: FilterFormState
    ): HasuraFilterExpression | null {
        return traverseFilterSchemaAndState(
            schemaNode,
            stateNode,
            {
                leaf: (schema, state): HasuraFilterExpression | null => {
                    const baseValue = state.value;
                    return FilterValue.match({
                        empty: null,
                        value: (filterValue: unknown) => {
                            const transform = schema.transform?.toQuery;

                            const transformResult: TransformResult =
                                transform
                                    ? transform(filterValue)
                                    : { field: schema.field, value: baseValue };

                            if ('condition' in transformResult) {
                                return transformResult.condition;
                            }

                            const transformedValue = transformResult.value;

                            return FilterValue.match({
                                empty: null,
                                value: (value: unknown) => {
                                    if (
                                        value === undefined ||
                                        value === '' ||
                                        value === null ||
                                        (Array.isArray(value) && value.length === 0)
                                    ) return null;

                                    const field = transformResult.field ?? schema.field;

                                    if (schema.value.type === 'customOperator') {
                                        if (!isNonEmptyCustomOperatorValue(value)) return null;
                                        return FilterValue.match({
                                            empty: null,
                                            value: (inner: unknown) => buildNestedKey(field, { [value.operator]: inner })
                                        }, value.value);
                                    }

                                    const opMap: Record<string, string> = {
                                        equals: '_eq',
                                        notEquals: '_neq',
                                        greaterThan: '_gt',
                                        lessThan: '_lt',
                                        greaterThanOrEqual: '_gte',
                                        lessThanOrEqual: '_lte',
                                        in: '_in',
                                        notIn: '_nin',
                                        like: '_like',
                                        iLike: '_ilike',
                                        isNull: '_is_null',
                                    };
                                    const op = opMap[schema.type];
                                    if (!op) return null;

                                    return buildNestedKey(field, { [op]: value });
                                }
                            }, transformedValue);
                        }
                    }, baseValue)
                },
                and: (_schema, _state, childResults): HasuraFilterExpression | null => {
                    const validChildren = childResults.filter((c): c is HasuraFilterExpression => c !== null);
                    if (validChildren.length === 0) return null;
                    return Hasura.and(...validChildren);
                },
                or: (_schema, _state, childResults): HasuraFilterExpression | null => {
                    const validChildren = childResults.filter((c): c is HasuraFilterExpression => c !== null);
                    if (validChildren.length === 0) return null;
                    return Hasura.or(...validChildren);
                },
                not: (_schema, _state, childResult): HasuraFilterExpression | null => {
                    return childResult ? Hasura.not(childResult) : null;
                }
            }
        );
    }

    const conditions: HasuraFilterExpression[] = [];
    for (const [filterId, formState] of filterState.entries()) {
        const filterDef = filtersById.get(filterId);
        if (!filterDef) continue;
        const condition = buildConditionsRecursive(filterDef.expression, formState);
        if (condition) {
            conditions.push(condition);
        }
    }
    if (conditions.length === 0) return Hasura.empty();
    if (conditions.length === 1) return conditions[0];
    return Hasura.and(...conditions);
}

// Unordered array equality helper used by Hasura comparisons
export function unorderedArrayEqual<T>(arrA: T[], arrB: T[], elemEqual: (x: T, y: T) => boolean): boolean {
    if (arrA.length !== arrB.length) return false;
    const used = new Array(arrB.length).fill(false);
    for (const a of arrA) {
        let found = false;
        for (let i = 0; i < arrB.length; i++) {
            if (!used[i] && elemEqual(a, arrB[i])) {
                used[i] = true;
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    return true;
}

export function hasuraFilterExpressionsAreEqual(a: HasuraFilterExpression, b: HasuraFilterExpression): boolean {
    return hasuraFilterExpressionsAreEqualNormalized(normalizeHasuraFilterExpression(a), normalizeHasuraFilterExpression(b));
}

function normalizeHasuraFilterExpression(expr: HasuraFilterExpression): HasuraFilterExpression {
    switch (expr.kind) {
        case 'empty':
            return expr;
        case 'where': {
            const path = expr.path.filter(Boolean);
            if (path.length === 0) return Hasura.empty();
            return { ...expr, path };
        }
        case 'scope': {
            const scopePath = expr.path.filter(Boolean);
            const inner = normalizeHasuraFilterExpression(expr.expr);
            if (inner.kind === 'empty') return Hasura.empty();
            if (scopePath.length === 0) return inner;

            if (inner.kind === 'where') {
                return {
                    kind: 'where',
                    path: [...scopePath, ...inner.path],
                    operator: inner.operator,
                };
            }
            if (inner.kind === 'scope') {
                return {
                    kind: 'scope',
                    path: [...scopePath, ...inner.path],
                    expr: inner.expr,
                };
            }

            return { kind: 'scope', path: scopePath, expr: inner };
        }
        case 'not': {
            const inner = normalizeHasuraFilterExpression(expr.item);
            return { kind: 'not', item: inner };
        }
        case 'and': {
            const items = expr.items
                .map(normalizeHasuraFilterExpression)
                .flatMap(i => i.kind === 'and' ? i.items : [i])
                .filter(i => i.kind !== 'empty');
            if (items.length === 0) return Hasura.empty();
            if (items.length === 1) return items[0];
            return { kind: 'and', items };
        }
        case 'or': {
            const items = expr.items
                .map(normalizeHasuraFilterExpression)
                .flatMap(i => i.kind === 'or' ? i.items : [i])
                .filter(i => i.kind !== 'empty');
            if (items.length === 0) return Hasura.empty();
            if (items.length === 1) return items[0];
            return { kind: 'or', items };
        }
    }
}

function hasuraFilterExpressionsAreEqualNormalized(a: HasuraFilterExpression, b: HasuraFilterExpression): boolean {
    if (a === b) return true;
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
        case 'empty':
            return true;
        case 'where': {
            const bb = b as Extract<HasuraFilterExpression, { kind: 'where' }>;
            if (a.path.length !== bb.path.length) return false;
            for (let i = 0; i < a.path.length; i++) {
                if (a.path[i] !== bb.path[i]) return false;
            }

            const opA = a.operator;
            const opB = bb.operator;
            if (Array.isArray(opA) || Array.isArray(opB)) {
                if (!Array.isArray(opA) || !Array.isArray(opB)) return false;
                return unorderedArrayEqual(opA, opB, hasuraOperatorsAreEqual);
            }
            return hasuraOperatorsAreEqual(opA, opB);
        }
        case 'scope': {
            const bb = b as Extract<HasuraFilterExpression, { kind: 'scope' }>;
            if (a.path.length !== bb.path.length) return false;
            for (let i = 0; i < a.path.length; i++) {
                if (a.path[i] !== bb.path[i]) return false;
            }
            return hasuraFilterExpressionsAreEqualNormalized(
                normalizeHasuraFilterExpression(a.expr),
                normalizeHasuraFilterExpression(bb.expr)
            );
        }
        case 'not': {
            const bb = b as Extract<HasuraFilterExpression, { kind: 'not' }>;
            return hasuraFilterExpressionsAreEqualNormalized(a.item, bb.item);
        }
        case 'and': {
            const bb = b as Extract<HasuraFilterExpression, { kind: 'and' }>;
            return unorderedArrayEqual(a.items, bb.items, hasuraFilterExpressionsAreEqualNormalized);
        }
        case 'or': {
            const bb = b as Extract<HasuraFilterExpression, { kind: 'or' }>;
            return unorderedArrayEqual(a.items, bb.items, hasuraFilterExpressionsAreEqualNormalized);
        }
    }
}

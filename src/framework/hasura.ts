import { FilterField, FilterSchemasAndGroups, FilterExpr } from './filters';
import { FilterFormState, traverseFilterSchemaAndState } from './filter-form-state';

// All supported Hasura operators for a field
export type HasuraOperator =
    | { _eq?: any }
    | { _neq?: any }
    | { _gt?: any }
    | { _lt?: any }
    | { _gte?: any }
    | { _lte?: any }
    | { _in?: any[] }
    | { _nin?: any[] }
    | { _like?: string }
    | { _ilike?: string }
    | { _is_null?: boolean }
    | { _similar?: string }
    | { _nsimilar?: string }
    | { _regex?: string }
    | { _nregex?: string }
    | { _iregex?: string }
    | { _niregex?: string };

// Type for Hasura boolean expressions (conditions)
export type HasuraCondition =
    | { _and: HasuraCondition[] }
    | { _or: HasuraCondition[] }
    | { _not: HasuraCondition }
    | { [field: string]: HasuraCondition | HasuraOperator | HasuraOperator[] };

// Build Hasura conditions from FilterFormState and FilterFieldSchema using schema-driven approach
export function buildHasuraConditions(
    filterState: Map<string, FilterFormState>,
    filterSchema: FilterSchemasAndGroups
): HasuraCondition {
    function buildNestedKey(field: FilterField, cond: any): HasuraCondition {
        if (typeof field === 'object') {
            if ('and' in field) {
                const conditions = field.and.map(fieldName => buildSingleNestedKey(fieldName, cond));
                return { _and: conditions };
            }
            if ('or' in field) {
                const conditions = field.or.map(fieldName => buildSingleNestedKey(fieldName, cond));
                return { _or: conditions };
            }
        }
        if (typeof field === 'string') {
            return buildSingleNestedKey(field, cond);
        }
        return {};
    }

    function buildSingleNestedKey(key: string, cond: any): HasuraCondition {
        if (!key.includes('.')) return { [key]: cond };
        const parts = key.split('.');
        return parts.reverse().reduce((acc, k) => ({ [k]: acc }), cond);
    }

    function buildConditionsRecursive(
        schemaNode: FilterExpr,
        stateNode: FilterFormState
    ): HasuraCondition | null {
        return traverseFilterSchemaAndState(
            schemaNode,
            stateNode,
            {
                leaf: (schema, state): HasuraCondition | null => {
                    let transformedValue = state.value;
                    let transformedField = schema.field;

                    if (schema.transform?.toQuery !== undefined) {
                        const transformResult = schema.transform.toQuery(state.value);
                        if ('condition' in transformResult) {
                            return transformResult.condition as HasuraCondition;
                        }
                        if ('field' in transformResult && transformResult.field !== undefined) {
                            transformedField = transformResult.field;
                        }
                        if ('value' in transformResult && transformResult.value !== undefined) {
                            transformedValue = transformResult.value;
                        }
                    }

                    if (schema.value.type === 'customOperator') {
                        const opVal = transformedValue;
                        if (!opVal || !opVal.operator || opVal.value === undefined || opVal.value === '' || opVal.value === null || (Array.isArray(opVal.value) && opVal.value.length === 0)) return null;
                        return buildNestedKey(transformedField, { [opVal.operator]: opVal.value });
                    }

                    if (transformedValue === undefined || transformedValue === '' || transformedValue === null || (Array.isArray(transformedValue) && transformedValue.length === 0)) return null;

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

                    return buildNestedKey(transformedField, { [op]: transformedValue });
                },
                and: (_schema, _state, childResults): HasuraCondition | null => {
                    const validChildren = childResults.filter((c): c is HasuraCondition => c !== null);
                    if (validChildren.length === 0) return null;
                    return { _and: validChildren };
                },
                or: (_schema, _state, childResults): HasuraCondition | null => {
                    const validChildren = childResults.filter((c): c is HasuraCondition => c !== null);
                    if (validChildren.length === 0) return null;
                    return { _or: validChildren };
                },
                not: (_schema, _state, childResult): HasuraCondition | null => {
                    return childResult ? { _not: childResult } : null;
                }
            }
        );
    }

    const conditions: HasuraCondition[] = [];
    for (const [filterId, formState] of filterState.entries()) {
        const filterDef = filterSchema.filters.find(f => f.id === filterId);
        if (!filterDef) continue;
        const condition = buildConditionsRecursive(filterDef.expression, formState);
        if (condition) {
            conditions.push(condition);
        }
    }
    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { _and: conditions };
}

// Deep equality for HasuraOperator objects
export function hasuraOperatorsAreEqual(a: HasuraOperator, b: HasuraOperator): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
        if (!bKeys.includes(k)) return false;
        const av = (a as any)[k];
        const bv = (b as any)[k];
        if (!deepValueEqual(av, bv)) return false;
    }
    return true;
}

// Helper: deep equality for primitive / array / object values (order-sensitive for arrays here)
function deepValueEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepValueEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (typeof a === 'object' && typeof b === 'object') {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        for (const k of aKeys) {
            if (!bKeys.includes(k)) return false;
            if (!deepValueEqual(a[k], b[k])) return false;
        }
        return true;
    }
    return false;
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

// Deep equality for HasuraCondition values (order-insensitive for logical arrays _and/_or and operator arrays)
export function hasuraConditionsAreEqual(a: HasuraCondition, b: HasuraCondition): boolean {
    if (a === b) return true;

    const isAnd = (c: HasuraCondition): c is { _and: HasuraCondition[] } => '_and' in c && Array.isArray((c as any)._and);
    const isOr = (c: HasuraCondition): c is { _or: HasuraCondition[] } => '_or' in c && Array.isArray((c as any)._or);
    const isNot = (c: HasuraCondition): c is { _not: HasuraCondition } => '_not' in c && typeof (c as any)._not === 'object' && (c as any)._not !== null && !Array.isArray((c as any)._not);

    if (isAnd(a) || isAnd(b)) {
        if (!isAnd(a) || !isAnd(b)) return false;
        return unorderedArrayEqual(a._and, b._and, hasuraConditionsAreEqual);
    }
    if (isOr(a) || isOr(b)) {
        if (!isOr(a) || !isOr(b)) return false;
        return unorderedArrayEqual(a._or, b._or, hasuraConditionsAreEqual);
    }
    if (isNot(a) || isNot(b)) {
        if (!isNot(a) || !isNot(b)) return false;
        return hasuraConditionsAreEqual(a._not, b._not);
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        if (!bKeys.includes(key)) return false;
        const av = (a as any)[key];
        const bv = (b as any)[key];
        if (Array.isArray(av) || Array.isArray(bv)) {
            if (!Array.isArray(av) || !Array.isArray(bv)) return false;
            if (!unorderedArrayEqual(av, bv, hasuraOperatorsAreEqual)) return false;
        } else {
            const isOperatorObject = (val: any): boolean => {
                return typeof val === 'object' && val !== null && Object.keys(val).every(k => k.startsWith('_'));
            };
            if (isOperatorObject(av) || isOperatorObject(bv)) {
                if (!isOperatorObject(av) || !isOperatorObject(bv)) return false;
                if (!hasuraOperatorsAreEqual(av as HasuraOperator, bv as HasuraOperator)) return false;
            } else {
                if (!hasuraConditionsAreEqual(av as HasuraCondition, bv as HasuraCondition)) return false;
            }
        }
    }
    return true;
}

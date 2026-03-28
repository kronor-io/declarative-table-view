// Raw Hasura filter objects (the actual GraphQL "*_bool_exp" JSON shape).
// This is the wire format that gets sent to Hasura.

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

export type HasuraFilterObject = HasuraFilterObjectLogical | HasuraFilterObjectField;

export type HasuraFilterObjectLogical =
    | { _and: HasuraFilterObject[] }
    | { _or: HasuraFilterObject[] }
    | { _not: HasuraFilterObject };

type HasuraFilterObjectLogicalPartial = {
    _and?: HasuraFilterObject[];
    _or?: HasuraFilterObject[];
    _not?: HasuraFilterObject;
};

export type HasuraFilterObjectField = HasuraFilterObjectLogicalPartial & {
    [field: string]: HasuraFilterObjectFieldValue;
};

export type HasuraFilterObjectFieldValue =
    | HasuraOperator
    | HasuraOperator[]
    | HasuraFilterObject;

// Deep equality for HasuraOperator objects
export function hasuraOperatorsAreEqual(a: HasuraOperator, b: HasuraOperator): boolean {
    if (Object.is(a, b)) return true;
    if (!isPlainObject(a) || !isPlainObject(b)) return false;

    const aEntries = Object.entries(a);
    const bEntries = Object.entries(b);
    if (aEntries.length !== bEntries.length) return false;

    for (const [key, aValue] of aEntries) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        const bValue = (b as any)[key];
        if (!deepValueEqual(aValue, bValue)) return false;
    }

    return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Helper: deep equality for primitive / array / plain-object values (order-sensitive for arrays here)
function deepValueEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepValueEqual(a[i], b[i])) return false;
        }
        return true;
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        for (const key of aKeys) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepValueEqual(a[key], b[key])) return false;
        }
        return true;
    }

    return false;
}

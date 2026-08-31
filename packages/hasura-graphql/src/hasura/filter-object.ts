// Hasura filter objects used inside the app.
// The GraphQL renderer serializes this structure directly into the query string.

// Generic, value-typed operator object.
// This is for compile-time help in DSLs/wrappers; serialization happens separately.
export type HasuraComparable = string | number | Date;

type ComparableOf<T> = Extract<T, HasuraComparable>;
type StringOf<T> = Extract<T, string>;
type InOf<T> = ReadonlyArray<NonNullable<T>>;

type ComparableOps<C> = [C] extends [never]
    ? Record<never, never>
    : {
          _gt?: C;
          _lt?: C;
          _gte?: C;
          _lte?: C;
      };

type StringOps<S> = [S] extends [never]
    ? Record<never, never>
    : {
          _like?: string;
          _ilike?: string;
          _similar?: string;
          _nsimilar?: string;
          _regex?: string;
          _nregex?: string;
          _iregex?: string;
          _niregex?: string;
      };

export type HasuraOperatorFor<T> = {
    _eq?: T;
    _neq?: T;
    _in?: InOf<T>;
    _nin?: InOf<T>;
    _isNull?: boolean;
} & ComparableOps<ComparableOf<T>> & StringOps<StringOf<T>>;

// Public operator type (normalized internal format). Kept intentionally loose.
// Historically this was expressed as a union of single-key objects; the object form is equivalent
// for the app's internal representation, and the GraphQL renderer converts it to Hasura's input shape.
export type HasuraOperator = HasuraOperatorFor<any>;

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

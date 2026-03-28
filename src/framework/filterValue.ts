export type FilterValue =
    | { type: 'empty' }
    | { type: 'value'; value: unknown };

export const empty: FilterValue = { type: 'empty' };

export function value(value: unknown): FilterValue {
    return { type: 'value', value };
}

export function isEmpty(value: FilterValue): value is { type: 'empty' } {
    return value.type === 'empty';
}

export function isValue(value: FilterValue): value is { type: 'value'; value: unknown } {
    return value.type === 'value';
}

export function valueOrNull(value: FilterValue): unknown | null {
    return isValue(value) ? value.value : null;
}

export function match<T>({ empty, value }: { empty: T; value: (v: unknown) => T }, filterValue: FilterValue): T {
    return isEmpty(filterValue) ? empty : value(filterValue.value);
}

export function flatMap(fn: (value: unknown) => FilterValue, filterValue: FilterValue): FilterValue {
    if (isEmpty(filterValue)) {
        return empty;
    }
    return fn(filterValue.value);
}

export function map(fn: (value: unknown) => unknown, filterValue: FilterValue): FilterValue {
    return flatMap((v) => value(fn(v)), filterValue);
}

export function fromJS(jsValue: unknown): FilterValue {
    if (jsValue === null || jsValue === undefined) {
        return empty;
    }
    return value(jsValue);
}

export function alt(fvs: FilterValue[]): FilterValue {
    for (const fv of fvs) {
        if (!isEmpty(fv)) {
            return fv;
        }
    }
    return empty;
}

export function fromObject(value: unknown): FilterValue | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const type = record['type'];
    if (type === 'empty') {
        return empty;
    }
    if (type === 'value' && 'value' in record) {
        return { type: 'value', value: record['value'] };
    }
    return null;
}

export function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;

    if (left instanceof Date || right instanceof Date) {
        return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
    }

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        if (left.length !== right.length) return false;
        return left.every((value, index) => valuesEqual(value, right[index]));
    }

    if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
        const leftRecord = left as Record<string, unknown>;
        const rightRecord = right as Record<string, unknown>;
        const leftKeys = Object.keys(leftRecord);
        if (leftKeys.length !== Object.keys(rightRecord).length) return false;
        return leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key) && valuesEqual(leftRecord[key], rightRecord[key]));
    }

    return false;
}

export function assertUniqueStringKeys<T>(
    items: readonly T[],
    getKey: (item: T) => string,
    options: {
        context: string;
        keyName?: string;
    }
): void {
    const keyName = options.keyName ?? 'id';
    const firstIndexByKey = new Map<string, number>();

    for (let index = 0; index < items.length; index++) {
        const key = getKey(items[index]);
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error(`${options.context}: Invalid ${keyName} at index ${index}`);
        }

        const firstIndex = firstIndexByKey.get(key);
        if (firstIndex !== undefined) {
            throw new Error(
                `${options.context}: Duplicate ${keyName} "${key}" (indices ${firstIndex} and ${index})`
            );
        }

        firstIndexByKey.set(key, index);
    }
}

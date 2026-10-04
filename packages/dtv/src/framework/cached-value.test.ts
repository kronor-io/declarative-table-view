import { describe, expect, it, jest } from '@jest/globals';
import { cachedValue } from './cached-value';

describe('cachedValue', () => {
    it('computes on the first read only', () => {
        const compute = jest.fn(() => ({ n: 1 }));
        const value = cachedValue(compute);

        expect(compute).not.toHaveBeenCalled();
        expect(value()).toBe(value());
        expect(compute).toHaveBeenCalledTimes(1);
    });

    it('keeps a replacement instead of computing', () => {
        const compute = jest.fn(() => 'computed');
        const value = cachedValue(compute);

        expect(value.set('replaced')).toBe('replaced');
        expect(value()).toBe('replaced');
        expect(compute).not.toHaveBeenCalled();

        value.set('replaced again');
        expect(value()).toBe('replaced again');
    });

    it('keeps a computed undefined or null as well', () => {
        const computeUndefined = jest.fn((): string | undefined => undefined);
        const maybe = cachedValue(computeUndefined);
        expect(maybe()).toBeUndefined();
        expect(maybe()).toBeUndefined();
        expect(computeUndefined).toHaveBeenCalledTimes(1);

        const computeNull = jest.fn((): string | null => null);
        const nullable = cachedValue(computeNull);
        expect(nullable()).toBeNull();
        expect(nullable()).toBeNull();
        expect(computeNull).toHaveBeenCalledTimes(1);
    });
});

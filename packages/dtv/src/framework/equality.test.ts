import { valuesEqual } from './equality';

describe('valuesEqual', () => {
    it('compares primitives and dates', () => {
        expect(valuesEqual('same', 'same')).toBe(true);
        expect(valuesEqual(NaN, NaN)).toBe(true);
        expect(valuesEqual(0, -0)).toBe(false);
        expect(valuesEqual(new Date('2026-01-02T03:04:05.000Z'), new Date('2026-01-02T03:04:05.000Z'))).toBe(true);
        expect(valuesEqual(new Date('2026-01-02T03:04:05.000Z'), new Date('2026-01-02T03:04:06.000Z'))).toBe(false);
    });

    it('compares arrays and objects structurally', () => {
        expect(valuesEqual(
            { a: [1, { b: 'two' }], c: null },
            { c: null, a: [1, { b: 'two' }] }
        )).toBe(true);
        expect(valuesEqual([1, 2], [1, 2, 3])).toBe(false);
        expect(valuesEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    });
});

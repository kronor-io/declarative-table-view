import { majorToMinor, minorToMajor, getCurrencyMajorUnitScale } from './currency';

describe('currency unit conversion', () => {
    it('converts USD major to minor and back (2 decimals)', () => {
        const scale = getCurrencyMajorUnitScale('USD');
        expect(scale).toBe(100);
        const minor = majorToMinor(12.34, 'USD');
        expect(minor).toBe(1234);
        const major = minorToMajor(minor, 'USD');
        expect(major).toBeCloseTo(12.34);
    });

    it('handles rounding correctly (USD)', () => {
        // 0.015 * 100 = 1.5 -> rounds to 2 cents
        const minor = majorToMinor(0.015, 'USD');
        expect(minor).toBe(2);
        expect(minorToMajor(minor, 'USD')).toBeCloseTo(0.02);
    });

    it('supports zero-decimal currency (JPY)', () => {
        const scale = getCurrencyMajorUnitScale('JPY');
        expect(scale).toBe(1);
        const minor = majorToMinor(1234, 'JPY');
        expect(minor).toBe(1234);
        const major = minorToMajor(minor, 'JPY');
        expect(major).toBe(1234);
    });

    it('supports three-decimal currency (KWD)', () => {
        const scale = getCurrencyMajorUnitScale('KWD');
        expect(scale).toBe(1000);
        const minor = majorToMinor(1.234, 'KWD');
        expect(minor).toBe(1234);
        const major = minorToMajor(minor, 'KWD');
        expect(major).toBeCloseTo(1.234);
    });

    it('throws on non-finite major', () => {
        expect(() => majorToMinor(Number.NaN, 'USD')).toThrow();
        expect(() => majorToMinor(Number.POSITIVE_INFINITY, 'USD')).toThrow();
    });

    it('throws on non-integer minor', () => {
        expect(() => minorToMajor(12.34 as unknown as number, 'USD')).toThrow();
    });
});

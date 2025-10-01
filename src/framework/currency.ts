// Currency helper utilities extracted from the former Currency component file.
// These functions provide locale resolution, fraction digit discovery, and
// conversion helpers between major (display) and minor (integer) currency units.

// Cache for currency fraction digit lookups
const currencyFractionDigitCache: Map<string, number> = new Map();

/**
 * Resolve a locale to use for currency formatting.
 * Priority:
 * 1. Explicitly provided locale argument
 * 2. navigator.language (browser default)
 * 3. First entry in navigator.languages
 * 4. undefined (lets Intl use implementation default)
 */
export function resolveLocale(locale?: string): string | undefined {
    if (locale) return locale;
    if (typeof navigator !== 'undefined') {
        const lang = (navigator as any).language || (Array.isArray((navigator as any).languages) && (navigator as any).languages[0]);
        return typeof lang === 'string' ? lang : undefined;
    }
    return undefined;
}

export function getCurrencyFractionDigits(currency: string, locale: string | undefined = undefined): number {
    const code = currency.toUpperCase();
    if (currencyFractionDigitCache.has(code)) return currencyFractionDigitCache.get(code)!;
    try {
        const { maximumFractionDigits } = new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions();
        const value: number = typeof maximumFractionDigits === 'number' ? maximumFractionDigits : 2;
        currencyFractionDigitCache.set(code, value);
        return value;
    } catch {
        currencyFractionDigitCache.set(code, 2);
        return 2;
    }
}

export function getCurrencyMajorUnitScale(currency: string, locale: string | undefined = undefined): number {
    return Math.pow(10, getCurrencyFractionDigits(currency, locale));
}

export function majorToMinor(major: number, currency: string, locale?: string): number {
    if (typeof major !== 'number' || !isFinite(major)) throw new Error('major must be a finite number');
    const scale = getCurrencyMajorUnitScale(currency, locale);
    // Use rounding to nearest minor unit to avoid FP drift
    return Math.round(major * scale);
}

export function minorToMajor(minor: number, currency: string, locale?: string): number {
    if (typeof minor !== 'number' || !Number.isInteger(minor)) throw new Error('minor must be an integer number of minor units');
    const scale = getCurrencyMajorUnitScale(currency, locale);
    return minor / scale;
}

export default {
    resolveLocale,
    getCurrencyFractionDigits,
    getCurrencyMajorUnitScale,
    majorToMinor,
    minorToMajor
};

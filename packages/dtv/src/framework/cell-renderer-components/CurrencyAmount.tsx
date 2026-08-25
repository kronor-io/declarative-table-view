// React import not required; file uses JSX via TSX but React 17+ JSX transform auto-injects.

import { resolveLocale, getCurrencyFractionDigits } from '../currency';

export interface CurrencyAmountProps {
    amount: number | string;
    currency: string;
    locale?: string;
    options?: Intl.NumberFormatOptions;
    className?: string;
    fractionDigitsOverride?: number;
}

export function CurrencyAmount({ amount, currency, locale, options = {}, className = '', fractionDigitsOverride }: CurrencyAmountProps) {
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount)) return null;
    const resolvedLocale = resolveLocale(locale);
    const fractionDigits = typeof fractionDigitsOverride === 'number' ? fractionDigitsOverride : getCurrencyFractionDigits(currency, resolvedLocale);
    const formatOptions: Intl.NumberFormatOptions = {
        style: 'currency',
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
        ...options
    };
    const formatter = new Intl.NumberFormat(resolvedLocale, formatOptions);
    return <span className={className}>{formatter.format(parsedAmount)}</span>;
}

export default CurrencyAmount;

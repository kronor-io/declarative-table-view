export const COUNTRY_CODES = [
    { label: 'Sweden (+46)', value: '+46' },
    { label: 'Austria (+43)', value: '+43' },
    { label: 'Belgium (+32)', value: '+32' },
    { label: 'Croatia (+385)', value: '+385' },
    { label: 'Cyprus (+357)', value: '+357' },
    { label: 'Czech Republic (+420)', value: '+420' },
    { label: 'Denmark (+45)', value: '+45' },
    { label: 'Estonia (+372)', value: '+372' },
    { label: 'Finland (+358)', value: '+358' },
    { label: 'France (+33)', value: '+33' },
    { label: 'Germany (+49)', value: '+49' },
    { label: 'Greece (+30)', value: '+30' },
    { label: 'Hungary (+36)', value: '+36' },
    { label: 'Iceland (+354)', value: '+354' },
    { label: 'Ireland (+353)', value: '+353' },
    { label: 'Italy (+39)', value: '+39' },
    { label: 'Latvia (+371)', value: '+371' },
    { label: 'Liechtenstein (+423)', value: '+423' },
    { label: 'Lithuania (+370)', value: '+370' },
    { label: 'Luxembourg (+352)', value: '+352' },
    { label: 'Malta (+356)', value: '+356' },
    { label: 'Netherlands (+31)', value: '+31' },
    { label: 'Norway (+47)', value: '+47' },
    { label: 'Poland (+48)', value: '+48' },
    { label: 'Portugal (+351)', value: '+351' },
    { label: 'Romania (+40)', value: '+40' },
    { label: 'Slovakia (+421)', value: '+421' },
    { label: 'Slovenia (+386)', value: '+386' },
    { label: 'Spain (+34)', value: '+34' },
];

export const DEFAULT_CODE = COUNTRY_CODES[0].value;

const CODES_LONGEST_FIRST = COUNTRY_CODES
    .map(c => c.value)
    .sort((a, b) => b.length - a.length);

export function splitCountryCode(value: string): { code: string | null; number: string } {
    const code = value.startsWith('+') ? CODES_LONGEST_FIRST.find(c => value.startsWith(c)) : undefined;
    return code ? { code, number: value.slice(code.length) } : { code: null, number: value };
}

// libphonenumber rejects a national number shorter than 2 digits.
const MIN_NATIONAL_DIGITS = 2;
// For a code we can't split off, require an E.164-plausible length instead.
const MIN_INTERNATIONAL_DIGITS = 8;

const countDigits = (s: string) => s.replace(/\D/g, '').length;

// Whether a filter value is long enough to cast to a phone number; anything shorter fails the whole query.
export function isQueryablePhoneNumber(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed.startsWith('+')) return countDigits(trimmed) >= MIN_NATIONAL_DIGITS;
    const split = splitCountryCode(trimmed);
    return split.code !== null
        ? countDigits(split.number) >= MIN_NATIONAL_DIGITS
        : countDigits(trimmed) >= MIN_INTERNATIONAL_DIGITS;
}

export function phoneFilterValue(code: string, number: string): string {
    const trimmed = number.trim();
    const candidate = trimmed.startsWith('+') ? trimmed : `${code}${trimmed}`;
    return isQueryablePhoneNumber(candidate) ? candidate : '';
}

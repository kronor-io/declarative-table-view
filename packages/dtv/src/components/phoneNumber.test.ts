import { describe, it, expect } from '@jest/globals';
import { isQueryablePhoneNumber, phoneFilterValue, splitCountryCode } from './phoneNumber';
import { filterTransforms } from '../framework/native-runtime';
import * as FilterValue from '../framework/filterValue';

describe('phoneFilterValue', () => {
    it('sends no filter for a country code without a number', () => {
        expect(phoneFilterValue('+46', '')).toBe('');
        expect(phoneFilterValue('+46', '   ')).toBe('');
        expect(phoneFilterValue('+46', '+')).toBe('');
    });

    it('sends no filter for a national number shorter than 2 digits', () => {
        expect(phoneFilterValue('+46', '1')).toBe('');
        expect(phoneFilterValue('+46', '12')).toBe('+4612');
    });

    it('prefixes the selected country code', () => {
        expect(phoneFilterValue('+47', '41234567')).toBe('+4741234567');
    });

    it('sends a number typed with its own code only once it is long enough', () => {
        expect(phoneFilterValue('+46', '+4')).toBe('');
        expect(phoneFilterValue('+46', '+44')).toBe('');
        expect(phoneFilterValue('+46', '+1')).toBe('');
        expect(phoneFilterValue('+46', '+15551234567')).toBe('+15551234567');
    });

    it('trims what it sends', () => {
        expect(phoneFilterValue('+46', ' +15551234567 ')).toBe('+15551234567');
        expect(phoneFilterValue('+46', ' 701234567 ')).toBe('+46701234567');
    });
});

describe('isQueryablePhoneNumber', () => {
    it('rejects a bare or padded country code', () => {
        expect(isQueryablePhoneNumber('+46')).toBe(false);
        expect(isQueryablePhoneNumber(' +46')).toBe(false);
        expect(isQueryablePhoneNumber('+358')).toBe(false);
    });

    it('accepts a full number', () => {
        expect(isQueryablePhoneNumber('+46701234567')).toBe(true);
    });
});

describe('splitCountryCode', () => {
    it('matches the longest known code', () => {
        expect(splitCountryCode('+358401234567')).toEqual({ code: '+358', number: '401234567' });
    });

    it('leaves a national number without a code', () => {
        expect(splitCountryCode('0701234567')).toEqual({ code: null, number: '0701234567' });
    });

    it('leaves an unknown code in the number', () => {
        expect(splitCountryCode('+15551234567')).toEqual({ code: null, number: '+15551234567' });
    });
});

describe('phoneNumber query transform', () => {
    const toQuery = (input: unknown) => filterTransforms.phoneNumber.toQuery(input);

    it('drops a bare country code saved by older versions', () => {
        expect(toQuery('+46')).toEqual({ value: FilterValue.empty });
        expect(toQuery('')).toEqual({ value: FilterValue.empty });
        expect(toQuery(null)).toEqual({ value: FilterValue.empty });
    });

    it('passes a full number through, trimmed', () => {
        expect(toQuery(' +46701234567 ')).toEqual({ value: FilterValue.value('+46701234567') });
    });
});

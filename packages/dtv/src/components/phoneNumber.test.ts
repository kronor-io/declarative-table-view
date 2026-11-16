import { describe, it, expect } from '@jest/globals';
import { phoneFilterValue, splitCountryCode } from './phoneNumber';

describe('phoneFilterValue', () => {
    it('sends no filter for a country code without a number', () => {
        expect(phoneFilterValue('+46', '')).toBe('');
        expect(phoneFilterValue('+46', '   ')).toBe('');
        expect(phoneFilterValue('+46', '+')).toBe('');
    });

    it('prefixes the selected country code', () => {
        expect(phoneFilterValue('+47', '41234567')).toBe('+4741234567');
    });

    it('keeps a number typed with its own unknown country code', () => {
        expect(phoneFilterValue('+46', '+15551234567')).toBe('+15551234567');
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

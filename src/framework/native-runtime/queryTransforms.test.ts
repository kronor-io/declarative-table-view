import { nativeRuntime } from './index';

describe('nativeRuntime.queryTransforms.autocomplete.toQuery', () => {
    const { toQuery } = nativeRuntime.queryTransforms.autocomplete;

    it('extracts value from object with value property', () => {
        const input = { value: 'ABC', label: 'Something Else' };
        expect(toQuery(input)).toEqual({ value: 'ABC' });
    });

    it('returns value as-is when input is empty string', () => {
        const input = '';
        expect(toQuery(input)).toEqual({ value: '' });
    });

    it('returns value as-is when input is null', () => {
        const input = null;
        expect(toQuery(input)).toEqual({ value: null });
    });

    it('returns value as-is when input is undefined', () => {
        const input = undefined;
        expect(toQuery(input)).toEqual({ value: undefined });
    });
});

describe('nativeRuntime.queryTransforms.autocompleteMultiple.toQuery', () => {
    const { toQuery } = nativeRuntime.queryTransforms.autocompleteMultiple;

    it('maps array of objects to array of their values', () => {
        const input = [
            { value: 'A', label: 'A Label' },
            { value: 'B', label: 'B Label' },
            { value: 123, label: 'Number Label' }
        ];
        expect(toQuery(input)).toEqual({ value: ['A', 'B', 123] });
    });

    it('handles empty array', () => {
        const input: any[] = [];
        expect(toQuery(input)).toEqual({ value: [] });
    });

    it('returns value as-is when input is null', () => {
        const input = null;
        expect(toQuery(input)).toEqual({ value: null });
    });

    it('returns value as-is when input is undefined', () => {
        const input = undefined;
        expect(toQuery(input)).toEqual({ value: undefined });
    });
});

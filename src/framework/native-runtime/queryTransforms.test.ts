import { nativeRuntime } from './index';
import * as FilterValue from '../filterValue';
import { hasuraCustomOperatorTransform, mapHasuraCustomOperatorInput } from './index';
import { hasuraFilterExpressionToObject } from '../graphql';

describe('nativeRuntime.queryTransforms.autocomplete.toQuery', () => {
    const { toQuery } = nativeRuntime.queryTransforms.autocomplete;
    const context = { field: 'ignored' };

    it('extracts value from object with value property', () => {
        const input = { value: 'ABC', label: 'Something Else' };
        expect(toQuery(input, context)).toEqual({ value: FilterValue.value('ABC') });
    });

    it('returns value as-is when input is empty string', () => {
        const input = '';
        expect(toQuery(input, context)).toEqual({ value: FilterValue.empty });
    });

    it('returns value as-is when input is null', () => {
        const input = null;
        expect(toQuery(input, context)).toEqual({ value: FilterValue.empty });
    });

    it('returns value as-is when input is undefined', () => {
        const input = undefined;
        expect(toQuery(input, context)).toEqual({ value: FilterValue.empty });
    });
});

describe('nativeRuntime.queryTransforms.autocompleteMultiple.toQuery', () => {
    const { toQuery } = nativeRuntime.queryTransforms.autocompleteMultiple;
    const context = { field: 'ignored' };

    it('maps array of objects to array of their values', () => {
        const input = [
            { value: 'A', label: 'A Label' },
            { value: 'B', label: 'B Label' },
            { value: 123, label: 'Number Label' }
        ];
        expect(toQuery(input, context)).toEqual({ value: FilterValue.value(['A', 'B', 123]) });
    });

    it('handles empty array', () => {
        const input: any[] = [];
        expect(toQuery(input, context)).toEqual({ value: FilterValue.value([]) });
    });

    it('returns value as-is when input is null', () => {
        const input = null;
        expect(toQuery(input, context)).toEqual({ value: FilterValue.empty });
    });

    it('returns value as-is when input is undefined', () => {
        const input = undefined;
        expect(toQuery(input, context)).toEqual({ value: FilterValue.empty });
    });
});

describe('nativeRuntime.queryTransforms.hasuraCustomOperator.toQuery', () => {
    const { toQuery } = hasuraCustomOperatorTransform;

    it('maps a custom operator payload to a Hasura condition using the provided field', () => {
        const result = toQuery(
            { operator: '_eq', value: FilterValue.value('a@example.com') },
            { field: 'email' }
        );

        expect(hasuraFilterExpressionToObject(result.condition)).toEqual({
            email: { _eq: 'a@example.com' }
        });
    });
});

describe('mapHasuraCustomOperatorInput', () => {
    it('maps the inner custom-operator value while preserving operator and FilterValue shape', () => {
        const result = mapHasuraCustomOperatorInput(
            { operator: '_like', value: FilterValue.value('abc') },
            (operator, value) => operator === '_like' && typeof value === 'string' ? `${value}%` : value
        );

        expect(result).toEqual({
            operator: '_like',
            value: FilterValue.value('abc%')
        });
    });

    it('returns invalid payloads unchanged', () => {
        expect(mapHasuraCustomOperatorInput('nope', value => value)).toBe('nope');
    });
});

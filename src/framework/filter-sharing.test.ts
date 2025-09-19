/**
 * @jest-environment jsdom
 */
import {
    encodeFilterState,
    decodeFilterState
} from './filter-sharing';
import { FilterState } from './state';

describe('filter-sharing', () => {
    const mockFilterState: FilterState = new Map([
        ['name-filter', {
            type: 'leaf',
            field: 'name',
            value: 'test',
            control: { type: 'text' },
            filterType: 'equals'
        }],
        ['date-filter', {
            type: 'leaf',
            field: 'date',
            value: new Date('2023-01-01'),
            control: { type: 'date' },
            filterType: 'greaterThanOrEqual'
        }]
    ]);

    describe('encodeFilterState', () => {
        it('should encode filter state to base64 URL-safe string', () => {
            const encoded = encodeFilterState(mockFilterState);

            expect(typeof encoded).toBe('string');
            expect(encoded.length).toBeGreaterThan(0);
            // Should not contain URL-unsafe characters
            expect(encoded).not.toMatch(/[+/=]/);
        });

        it('should handle empty filter state', () => {
            const encoded = encodeFilterState(new Map());
            expect(typeof encoded).toBe('string');
        });

        it('should handle complex nested filters', () => {
            const complexFilter: FilterState = new Map([
                ['complex-filter', {
                    type: 'and',
                    children: [
                        {
                            type: 'leaf',
                            field: 'name',
                            value: 'test',
                            control: { type: 'text' },
                            filterType: 'equals'
                        },
                        {
                            type: 'not',
                            child: {
                                type: 'leaf',
                                field: 'status',
                                value: 'inactive',
                                control: { type: 'text' },
                                filterType: 'equals'
                            },
                            filterType: 'not'
                        }
                    ],
                    filterType: 'and'
                }]
            ]);

            expect(() => encodeFilterState(complexFilter)).not.toThrow();
        });
    });

    describe('decodeFilterState', () => {
        it('should decode base64 string back to filter state', () => {
            const encoded = encodeFilterState(mockFilterState);
            const decoded = decodeFilterState(encoded);

            expect(typeof decoded).toBe('object');
            expect(decoded).not.toBeNull();
            expect(Array.isArray(decoded)).toBe(false);
            expect(Object.keys(decoded)).toHaveLength(2);
        });

        it('should handle invalid base64 strings', () => {
            // Mock console.error to suppress expected error output in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            expect(() => decodeFilterState('invalid-base64')).toThrow();

            // Restore console.error
            consoleSpy.mockRestore();
        });

        it('should handle empty string', () => {
            // Mock console.error to suppress expected error output in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            expect(() => decodeFilterState('')).toThrow();

            // Restore console.error
            consoleSpy.mockRestore();
        });
    });

    describe('round-trip encoding/decoding', () => {
        it('should preserve filter state through encode/decode cycle', () => {
            const encoded = encodeFilterState(mockFilterState);
            const decoded: any = decodeFilterState(encoded);

            // The decoded state should be an object with filter ID keys
            expect(typeof decoded).toBe('object');
            expect(Array.isArray(decoded)).toBe(false);
            expect(Object.keys(decoded)).toHaveLength(2);

            // Check that both filters are present with their correct data
            expect(decoded['name-filter']).toEqual({
                type: 'leaf',
                field: 'name',
                value: 'test',
                control: { type: 'text' },
                filterType: 'equals'
            });

            expect(decoded['date-filter']).toEqual({
                type: 'leaf',
                field: 'date',
                value: '2023-01-01T00:00:00.000Z', // Date serialized as ISO string
                control: { type: 'date' },
                filterType: 'greaterThanOrEqual'
            });
        });
    });
});

/**
 * @jest-environment jsdom
 */
import {
    encodeSharedFilterState,
    decodeSharedFilterState
} from './filter-sharing';
import { FilterState } from './state';
import type { FilterGroups } from './filters';
import * as FilterValue from './filterValue';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('filter-sharing', () => {
    const filterGroups: FilterGroups = [
        {
            name: 'test',
            label: 'Test',
            filters: [
                {
                    id: 'name-filter',
                    label: 'Name',
                    expression: {
                        type: 'equals',
                        field: 'name',
                        value: { type: 'text', initialValue: null }
                    },
                    aiGenerated: false,
                },
                {
                    id: 'date-filter',
                    label: 'Date',
                    expression: {
                        type: 'equals',
                        field: 'date',
                        value: { type: 'date', initialValue: null }
                    },
                    aiGenerated: false,
                }
            ]
        }
    ];

    const mockFilterState: FilterState = new Map([
        ['name-filter', {
            type: 'leaf',
            value: FilterValue.value('test')
        }],
        ['date-filter', {
            type: 'leaf',
            value: FilterValue.value(new Date('2023-01-01'))
        }]
    ]);

    describe('encodeSharedFilterState', () => {
        it('should encode filter state to base64 URL-safe string', () => {
            const encoded = encodeSharedFilterState({ id: 'view-a', filterGroups }, mockFilterState);

            expect(typeof encoded).toBe('string');
            expect(encoded.length).toBeGreaterThan(0);
            // Should not contain URL-unsafe characters
            expect(encoded).not.toMatch(/[+/=]/);
        });

        it('should handle empty filter state', () => {
            const encoded = encodeSharedFilterState({ id: 'view-a', filterGroups }, new Map());
            expect(typeof encoded).toBe('string');
        });

        it('should handle complex nested filters', () => {
            const complexFilter: FilterState = new Map([
                ['complex-filter', {
                    type: 'and',
                    children: [
                        {
                            type: 'leaf',
                            value: FilterValue.value('test')
                        },
                        {
                            type: 'not',
                            child: {
                                type: 'leaf',
                                value: FilterValue.value('inactive')
                            },
                        }
                    ],
                }]
            ]);

            expect(() => encodeSharedFilterState({ id: 'view-a', filterGroups }, complexFilter)).not.toThrow();
        });
    });

    describe('decodeSharedFilterState', () => {
        it('should decode base64 string back to filter state', () => {
            const encoded = encodeSharedFilterState({ id: 'view-a', filterGroups }, mockFilterState);
            const { view, definitionRevision, state: decoded } = decodeSharedFilterState(encoded);

            expect(view).toBe('view-a');
            expect(definitionRevision).toBe(1);
            expect(typeof decoded).toBe('object');
            expect(decoded).not.toBeNull();
            expect(Array.isArray(decoded)).toBe(false);
            expect(isRecord(decoded)).toBe(true);
            if (!isRecord(decoded)) {
                throw new Error('Expected decoded filter state to be a record');
            }
            expect(Object.keys(decoded)).toHaveLength(2);
        });

        it('should handle invalid base64 strings', () => {
            // Mock console.error to suppress expected error output in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            expect(() => decodeSharedFilterState('invalid-base64')).toThrow();

            // Restore console.error
            consoleSpy.mockRestore();
        });

        it('should handle empty string', () => {
            // Mock console.error to suppress expected error output in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            expect(() => decodeSharedFilterState('')).toThrow();

            // Restore console.error
            consoleSpy.mockRestore();
        });
    });

    describe('round-trip encoding/decoding', () => {
        it('should preserve filter state through encode/decode cycle', () => {
            const encoded = encodeSharedFilterState({ id: 'view-a', filterGroups }, mockFilterState);
            const decoded = decodeSharedFilterState(encoded).state;

            // The decoded state should be an object with filter ID keys
            expect(typeof decoded).toBe('object');
            expect(Array.isArray(decoded)).toBe(false);
            expect(isRecord(decoded)).toBe(true);
            if (!isRecord(decoded)) {
                throw new Error('Expected decoded filter state to be a record');
            }
            expect(Object.keys(decoded)).toHaveLength(2);

            // Check that both filters are present with their correct data
            expect(decoded['name-filter']).toEqual({
                type: 'leaf',
                value: { type: 'value', value: 'test' }
            });

            expect(decoded['date-filter']).toEqual({
                type: 'leaf',
                value: { type: 'value', value: '2023-01-01T00:00:00.000Z' } // Date serialized as ISO string
            });
        });
    });

    describe('links from before views were named in them', () => {
        const toBase64Url = (json: unknown) => btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        it('decodes a bare filter state, with no view', () => {
            const decoded = decodeSharedFilterState(toBase64Url({
                'name-filter': { type: 'leaf', value: { type: 'value', value: 'test' } },
                'legacy-filter': { type: 'leaf', value: 'raw' }
            }));

            expect(decoded).toEqual({
                view: null,
                definitionRevision: 1,
                state: {
                    'name-filter': { type: 'leaf', value: { type: 'value', value: 'test' } },
                    'legacy-filter': { type: 'leaf', value: { type: 'legacy', raw: 'raw' } }
                }
            });
        });

        it('does not mistake filters named like the envelope for one', () => {
            const decoded = decodeSharedFilterState(toBase64Url({
                view: { type: 'leaf', value: { type: 'value', value: 'v' } },
                state: { type: 'leaf', value: { type: 'empty' } }
            }));

            expect(decoded.view).toBeNull();
            expect(Object.keys(decoded.state)).toEqual(['view', 'state']);
        });
    });
});

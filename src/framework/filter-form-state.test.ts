import {
    FilterFormState,
    serializeFilterFormStateArray,
    parseFilterFormState
} from './filter-form-state';
import { FilterFieldSchema } from './filters';

describe('filter-form-state', () => {
    const mockFilterSchema: FilterFieldSchema = {
        groups: [
            { name: 'Basic', label: 'Basic' }
        ],
        filters: [
            {
                id: 'email-filter',
                label: 'Email',
                expression: {
                    type: 'equals',
                    field: 'email',
                    value: { type: 'text', label: 'Email' }
                },
                group: 'Basic',
                aiGenerated: false
            },
            {
                id: 'date-filter',
                label: 'Date',
                expression: {
                    type: 'equals',
                    field: 'created_at',
                    value: { type: 'date', label: 'Created Date' }
                },
                group: 'Basic',
                aiGenerated: false
            }
        ]
    };

    const mockFilterState: FilterFormState[] = [
        {
            type: 'leaf',
            field: 'email',
            value: 'test@example.com',
            control: { type: 'text', label: 'Email' },
            filterType: 'equals'
        },
        {
            type: 'leaf',
            field: 'created_at',
            value: new Date('2023-01-01T00:00:00.000Z'),
            control: { type: 'date', label: 'Created Date' },
            filterType: 'equals'
        }
    ];

    describe('serializeFilterFormStateArray', () => {
        it('should serialize filter state array to JSON-compatible format', () => {
            const serialized = serializeFilterFormStateArray(mockFilterState);

            expect(serialized).toHaveLength(2);
            expect(serialized[0]).toEqual({
                type: 'leaf',
                field: 'email',
                value: 'test@example.com',
                control: { type: 'text', label: 'Email' },
                filterType: 'equals'
            });
            expect(serialized[1]).toEqual({
                type: 'leaf',
                field: 'created_at',
                value: '2023-01-01T00:00:00.000Z', // Date should be serialized as ISO string
                control: { type: 'date', label: 'Created Date' },
                filterType: 'equals'
            });
        });

        it('should handle complex nested structures', () => {
            const complexState: FilterFormState[] = [
                {
                    type: 'and',
                    filterType: 'and',
                    children: [
                        {
                            type: 'leaf',
                            field: 'email',
                            value: 'test@example.com',
                            control: { type: 'text', label: 'Email' },
                            filterType: 'equals'
                        },
                        {
                            type: 'not',
                            filterType: 'not',
                            child: {
                                type: 'leaf',
                                field: 'status',
                                value: 'deleted',
                                control: { type: 'text', label: 'Status' },
                                filterType: 'equals'
                            }
                        }
                    ]
                }
            ];

            const serialized = serializeFilterFormStateArray(complexState);
            expect(serialized).toHaveLength(1);
            expect(serialized[0].type).toBe('and');
            expect(serialized[0].children).toHaveLength(2);
            expect(serialized[0].children[1].type).toBe('not');
        });
    });

    describe('parseFilterFormState', () => {
        it('should parse serialized state back to FilterFormState with date handling', () => {
            const serialized = [
                {
                    type: 'leaf',
                    field: 'email',
                    value: 'test@example.com',
                    control: { type: 'text', label: 'Email' },
                    filterType: 'equals'
                },
                {
                    type: 'leaf',
                    field: 'created_at',
                    value: '2023-01-01T00:00:00.000Z',
                    control: { type: 'date', label: 'Created Date' },
                    filterType: 'equals'
                }
            ];

            const parsed = parseFilterFormState(serialized, mockFilterSchema);

            expect(parsed).toHaveLength(2);
            expect((parsed[0] as any).value).toBe('test@example.com');
            expect((parsed[1] as any).value).toBeInstanceOf(Date);
            expect(((parsed[1] as any).value as Date).toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });

        it('should handle invalid date strings gracefully', () => {
            // Mock console.warn to suppress expected warning
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const serialized = [
                {
                    type: 'leaf',
                    field: 'created_at',
                    value: 'invalid-date',
                    control: { type: 'date', label: 'Created Date' },
                    filterType: 'equals'
                }
            ];

            const parsed = parseFilterFormState(serialized, mockFilterSchema);
            expect(parsed).toHaveLength(1);
            // Should handle invalid date gracefully
            expect((parsed[0] as any).value).toBe('invalid-date');

            // Verify warning was called and restore console
            expect(consoleSpy).toHaveBeenCalledWith('Failed to parse date for field created_at:', 'invalid-date');
            consoleSpy.mockRestore();
        });

        it('should return empty array on parse error', () => {
            // Mock console.error to suppress expected error
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const result = parseFilterFormState(null as any, mockFilterSchema);
            expect(result).toEqual([]);

            // Verify error was logged and restore console
            expect(consoleSpy).toHaveBeenCalledWith('Failed to parse filter state');
            consoleSpy.mockRestore();
        });
    });

    describe('round-trip serialization/parsing', () => {
        it('should preserve data through serialize/parse cycle', () => {
            const serialized = serializeFilterFormStateArray(mockFilterState);
            const parsed = parseFilterFormState(serialized, mockFilterSchema);

            expect(parsed).toHaveLength(mockFilterState.length);
            expect((parsed[0] as any).field).toBe((mockFilterState[0] as any).field);
            expect((parsed[0] as any).value).toBe((mockFilterState[0] as any).value);
            expect((parsed[1] as any).field).toBe((mockFilterState[1] as any).field);
            expect((parsed[1] as any).value).toEqual((mockFilterState[1] as any).value);
        });
    });
});

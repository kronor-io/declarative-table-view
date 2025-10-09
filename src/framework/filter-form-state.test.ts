import {
    serializeFilterFormStateMap,
    parseFilterFormState
} from './filter-form-state';
import { FilterSchemasAndGroups } from './filters';
import { FilterState } from './state';

describe('filter-form-state', () => {
    const mockFilterSchema: FilterSchemasAndGroups = {
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

    const mockFilterState: FilterState = new Map([
        ['email-filter', {
            type: 'leaf',
            field: 'email',
            value: 'test@example.com',
            control: { type: 'text', label: 'Email' },
            filterType: 'equals'
        }],
        ['date-filter', {
            type: 'leaf',
            field: 'created_at',
            value: new Date('2023-01-01T00:00:00.000Z'),
            control: { type: 'date', label: 'Created Date' },
            filterType: 'equals'
        }]
    ]);

    describe('serializeFilterFormStateMap', () => {
        it('should serialize filter state Map to JSON-compatible format', () => {
            const serialized = serializeFilterFormStateMap(mockFilterState);

            expect(typeof serialized).toBe('object');
            expect(serialized).not.toBeNull();
            expect(Array.isArray(serialized)).toBe(false);

            // Check that both filters are present as object properties
            expect(serialized['email-filter']).toEqual({
                type: 'leaf',
                field: 'email',
                value: 'test@example.com',
                control: { type: 'text', label: 'Email' },
                filterType: 'equals'
            });

            expect(serialized['date-filter']).toEqual({
                type: 'leaf',
                field: 'created_at',
                value: '2023-01-01T00:00:00.000Z', // Date should be serialized as ISO string
                control: { type: 'date', label: 'Created Date' },
                filterType: 'equals'
            });
        });

        it('should handle complex nested structures', () => {
            const complexState: FilterState = new Map([
                ['complex-filter', {
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
                }]
            ]);

            const serialized = serializeFilterFormStateMap(complexState);
            expect(typeof serialized).toBe('object');
            expect(Array.isArray(serialized)).toBe(false);

            const complexFilter = serialized['complex-filter'];
            expect(complexFilter).toBeDefined();
            expect(complexFilter.type).toBe('and');
            expect(complexFilter.children).toHaveLength(2);
            expect(complexFilter.children[1].type).toBe('not');
        });
    });

    describe('parseFilterFormState', () => {
        it('should parse serialized state back to FilterState with date handling', () => {
            const serialized = {
                'email-filter': {
                    type: 'leaf',
                    field: 'email',
                    value: 'test@example.com',
                    control: { type: 'text', label: 'Email' },
                    filterType: 'equals'
                },
                'date-filter': {
                    type: 'leaf',
                    field: 'created_at',
                    value: '2023-01-01T00:00:00.000Z',
                    control: { type: 'date', label: 'Created Date' },
                    filterType: 'equals'
                }
            };

            const parsed = parseFilterFormState(serialized, mockFilterSchema);

            expect(parsed).toBeInstanceOf(Map);
            expect(parsed.size).toBe(2);

            const emailFilter = parsed.get('email-filter');
            expect(emailFilter).toEqual({ type: 'leaf', value: 'test@example.com' });

            const dateFilter = parsed.get('date-filter');
            expect(dateFilter?.type).toBe('leaf');
            expect((dateFilter as any).value).toBeInstanceOf(Date);
            expect(((dateFilter as any).value as Date).toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });

        it('should treat invalid date strings as plain strings', () => {
            const serialized = {
                'date-filter': {
                    type: 'leaf',
                    field: 'created_at',
                    value: 'invalid-date',
                    control: { type: 'date', label: 'Created Date' },
                    filterType: 'equals'
                }
            };
            const parsed = parseFilterFormState(serialized, mockFilterSchema);
            const dateFilter = parsed.get('date-filter');
            expect(dateFilter).toEqual({ type: 'leaf', value: 'invalid-date' });
        });
    });

    describe('round-trip serialization/parsing', () => {
        it('should preserve data through serialize/parse cycle', () => {
            // Use the new serializeFilterFormStateMap function for a true round-trip test
            const serialized = serializeFilterFormStateMap(mockFilterState);
            const parsed = parseFilterFormState(serialized, mockFilterSchema);

            expect(parsed).toBeInstanceOf(Map);
            expect(parsed.size).toBe(2);

            const emailFilter = parsed.get('email-filter');
            const dateFilter = parsed.get('date-filter');

            expect(emailFilter).toEqual({ type: 'leaf', value: 'test@example.com' });
            expect(dateFilter?.type).toBe('leaf');
            expect((dateFilter as any).value).toBeInstanceOf(Date);
            expect(((dateFilter as any).value as Date).toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });
    });
});

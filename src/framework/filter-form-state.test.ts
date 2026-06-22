import {
    serializeFilterFormStateMap,
    parseFilterFormState,
} from './filter-form-state';
import * as FilterValue from './filterValue';
import type { FilterGroups } from './filters';
import { FilterState } from './state';

function expectLeafValue(node: unknown): FilterValue.FilterValue {
    expect(node).toBeDefined();
    expect(node).toHaveProperty('type', 'leaf');

    if (!node || typeof node !== 'object' || !('type' in node) || node.type !== 'leaf') {
        throw new Error('Expected leaf');
    }

    return (node as { type: 'leaf'; value: FilterValue.FilterValue }).value;
}

function expectFilterValueValue(value: FilterValue.FilterValue): unknown {
    expect(value.type).toBe('value');

    if (!FilterValue.isValue(value)) {
        throw new Error('Expected value');
    }

    return value.value;
}

function expectRecord(value: unknown): Record<string, unknown> {
    expect(typeof value).toBe('object');
    expect(value).not.toBeNull();

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Expected record');
    }

    return value as Record<string, unknown>;
}

describe('filter-form-state', () => {
    const mockFilterSchema: FilterGroups = [
        {
            name: 'Basic',
            label: 'Basic',
            filters: [
                {
                    id: 'email-filter',
                    label: 'Email',
                    expression: {
                        type: 'equals',
                        field: 'email',
                        value: { type: 'text', label: 'Email' }
                    },
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
                    aiGenerated: false
                },
                {
                    id: 'custom-op-filter',
                    label: 'Custom',
                    expression: {
                        type: 'equals',
                        field: 'field',
                        value: {
                            type: 'customOperator',
                            label: 'Custom',
                            operators: [{ label: 'Equals', value: '_eq' }],
                            valueControl: { type: 'text', label: 'Inner' }
                        }
                    },
                    aiGenerated: false
                }
            ]
        }
    ];

    const mockFilterState: FilterState = new Map([
        ['email-filter', {
            type: 'leaf',
            value: FilterValue.value('test@example.com')
        }],
        ['date-filter', {
            type: 'leaf',
            value: FilterValue.value(new Date('2023-01-01T00:00:00.000Z'))
        }],
        ['empty-filter', {
            type: 'leaf',
            value: FilterValue.empty
        }]
    ]);

    describe('serializeFilterFormStateMap', () => {
        it('should serialize filter state Map to JSON-compatible format', () => {
            const serialized = serializeFilterFormStateMap(mockFilterState, mockFilterSchema);

            expect(typeof serialized).toBe('object');
            expect(serialized).not.toBeNull();
            expect(Array.isArray(serialized)).toBe(false);

            // Unknown-to-schema filters are serialized as-is (no schema -> no emptiness check)
            expect(serialized['empty-filter']).toEqual({ type: 'leaf', value: { type: 'empty' } });

            expect(serialized['email-filter']).toEqual({
                type: 'leaf',
                value: { type: 'value', value: 'test@example.com' }
            });

            expect(serialized['date-filter']).toEqual({
                type: 'leaf',
                value: { type: 'value', value: '2023-01-01T00:00:00.000Z' }
            });
        });

        it('should handle complex nested structures', () => {
            const complexState: FilterState = new Map([
                ['complex-filter', {
                    type: 'and',
                    children: [
                        {
                            type: 'leaf',
                            value: FilterValue.value('test@example.com')
                        },
                        {
                            type: 'not',
                            child: {
                                type: 'leaf',
                                value: FilterValue.value('deleted')
                            }
                        }
                    ]
                }]
            ]);

            const serialized = serializeFilterFormStateMap(complexState, mockFilterSchema);
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
                    value: { type: 'value', value: 'test@example.com' }
                },
                'date-filter': {
                    type: 'leaf',
                    value: { type: 'value', value: '2023-01-01T00:00:00.000Z' }
                }
            };

            const parsed = parseFilterFormState(serialized, mockFilterSchema);

            expect(parsed).toBeInstanceOf(Map);
            expect(parsed.size).toBe(3);

            const emailFilter = parsed.get('email-filter');
            expect(emailFilter).toEqual({ type: 'leaf', value: { type: 'value', value: 'test@example.com' } });

            const dateValue = expectFilterValueValue(expectLeafValue(parsed.get('date-filter')));
            expect(dateValue).toBeInstanceOf(Date);
            expect((dateValue as Date).toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });

        it('should treat invalid date strings as empty', () => {
            const serialized = {
                'date-filter': {
                    type: 'leaf',
                    value: { type: 'value', value: 'invalid-date' }
                }
            };
            const parsed = parseFilterFormState(serialized, mockFilterSchema);
            const dateFilter = parsed.get('date-filter');
            expect(dateFilter).toEqual({ type: 'leaf', value: { type: 'empty' } });
        });

        it('should migrate legacy raw leaf values into ADT', () => {
            const legacySerialized = {
                'email-filter': { type: 'leaf', value: 'test@example.com' },
                'date-filter': { type: 'leaf', value: '2023-01-01T00:00:00.000Z' }
            };

            const parsed = parseFilterFormState(legacySerialized, mockFilterSchema);
            expect(expectLeafValue(parsed.get('email-filter'))).toEqual({ type: 'value', value: 'test@example.com' });

            const dateValue = expectFilterValueValue(expectLeafValue(parsed.get('date-filter')));
            expect(dateValue).toBeInstanceOf(Date);
        });

        it('should migrate legacy customOperator payload with primitive inner value into canonical nested form', () => {
            const legacySerialized = {
                'custom-op-filter': {
                    type: 'leaf',
                    value: {
                        type: 'value',
                        value: { operator: '_eq', value: 'hello' }
                    }
                }
            };

            const parsed = parseFilterFormState(legacySerialized, mockFilterSchema);
            const payload = expectRecord(expectFilterValueValue(expectLeafValue(parsed.get('custom-op-filter'))));
            expect(payload.operator).toBe('_eq');
            expect(payload.value).toEqual(FilterValue.value('hello'));
        });

        it('should treat operator-only legacy customOperator payload as empty', () => {
            const legacySerialized = {
                'custom-op-filter': {
                    type: 'leaf',
                    value: {
                        type: 'value',
                        value: { operator: '_eq', value: '' }
                    }
                }
            };

            const parsed = parseFilterFormState(legacySerialized, mockFilterSchema);
            expect(parsed.get('custom-op-filter')).toEqual({
                type: 'leaf',
                value: FilterValue.empty
            });
        });
    });

    describe('round-trip serialization/parsing', () => {
        it('should preserve data through serialize/parse cycle', () => {
            // Use the new serializeFilterFormStateMap function for a true round-trip test
            const serialized = serializeFilterFormStateMap(mockFilterState, mockFilterSchema);
            const parsed = parseFilterFormState(serialized, mockFilterSchema);

            expect(parsed).toBeInstanceOf(Map);
            expect(parsed.size).toBe(3);

            const emailFilter = parsed.get('email-filter');
            const dateFilter = parsed.get('date-filter');

            expect(emailFilter).toEqual({ type: 'leaf', value: { type: 'value', value: 'test@example.com' } });
            const dateValue = expectFilterValueValue(expectLeafValue(dateFilter));
            expect(dateValue).toBeInstanceOf(Date);
            expect((dateValue as Date).toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });
    });
});

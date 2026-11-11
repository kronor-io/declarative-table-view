import { afterAll, beforeEach, jest } from '@jest/globals';
import {
    decodeFilterState,
    serializeFilterFormStateMap,
    parseFilterFormState,
} from './filter-form-state';
import * as FilterValue from './filterValue';
import type { FilterControl, FilterExpr, FilterGroups } from './filters';
import type { UndecodedFilterState } from './user-data-undecoded';
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

    describe('stored values that do not fit their control', () => {
        const suggestionFetcher = (() => Promise.resolve([])) as never;
        const leafOf = (cmp: 'equals' | 'in', value: FilterControl): FilterExpr => ({ type: cmp, field: 'field', value });
        const filters: Record<string, FilterExpr> = {
            multiselect: leafOf('in', { type: 'multiselect', items: [{ label: 'Card', value: 68 }, { label: 'Invoice', value: 69 }] }),
            autocompleteMultiple: leafOf('in', { type: 'autocomplete', multiple: true, suggestionFetcher }),
            autocomplete: leafOf('equals', { type: 'autocomplete', suggestionFetcher }),
            dropdown: leafOf('equals', { type: 'dropdown', items: [{ label: 'Card', value: 68 }] }),
            dropdownOfLists: leafOf('equals', { type: 'dropdown', items: [{ label: 'Cards', value: [68, 70] }] }),
            text: leafOf('equals', { type: 'text' }),
            number: leafOf('equals', { type: 'number' }),
            date: leafOf('equals', { type: 'date' }),
            custom: leafOf('equals', { type: 'custom', component: () => null }),
            operatorOverList: leafOf('in', {
                type: 'customOperator',
                operators: [{ label: 'in', value: '_in' }],
                valueControl: { type: 'multiselect', items: [] }
            }),
            operatorOverText: leafOf('equals', {
                type: 'customOperator',
                operators: [{ label: 'equals', value: '_eq' }],
                valueControl: { type: 'text' }
            })
        };
        const groups: FilterGroups = [{
            name: 'default',
            label: null,
            filters: Object.entries(filters).map(([id, expression]) => ({ id, label: id, aiGenerated: false, expression }))
        }];
        const value = (stored: unknown) => ({ type: 'leaf', value: { type: 'value', value: stored } }) as UndecodedFilterState[string];
        const legacy = (raw: unknown) => ({ type: 'leaf', value: { type: 'legacy', raw } }) as UndecodedFilterState[string];

        function decodeOne(filterId: string, stored: UndecodedFilterState[string]) {
            const decoded = decodeFilterState({ [filterId]: stored }, groups);
            return { state: decoded.state.get(filterId), reset: decoded.resetFilterIds };
        }

        const warn = jest.spyOn(console, 'warn');
        beforeEach(() => {
            warn.mockReset();
            warn.mockImplementation(() => undefined);
        });
        afterAll(() => {
            warn.mockRestore();
        });

        it('reads one value as a list of it where the control takes several, as stored by a dropdown that became a multiselect', () => {
            expect(decodeOne('multiselect', value(68))).toEqual({ state: { type: 'leaf', value: FilterValue.value([68]) }, reset: [] });
            expect(decodeOne('multiselect', legacy(68))).toEqual({ state: { type: 'leaf', value: FilterValue.value([68]) }, reset: [] });
            expect(decodeOne('autocompleteMultiple', value({ id: 7, label: 'Acme' })))
                .toEqual({ state: { type: 'leaf', value: FilterValue.value([{ id: 7, label: 'Acme' }]) }, reset: [] });
            expect(decodeOne('operatorOverList', value({ operator: '_in', value: { type: 'value', value: 68 } })))
                .toEqual({ state: { type: 'leaf', value: FilterValue.value({ operator: '_in', value: FilterValue.value([68]) }) }, reset: [] });
            expect(warn).not.toHaveBeenCalled();
        });

        it('leaves lists, and values that fit, as they are', () => {
            expect(decodeOne('multiselect', value([68, 69])).state).toEqual({ type: 'leaf', value: FilterValue.value([68, 69]) });
            expect(decodeOne('multiselect', value('')).state).toEqual({ type: 'leaf', value: FilterValue.empty });
            expect(decodeOne('dropdown', value(68)).state).toEqual({ type: 'leaf', value: FilterValue.value(68) });
            expect(decodeOne('dropdownOfLists', value([68, 70])).state).toEqual({ type: 'leaf', value: FilterValue.value([68, 70]) });
            expect(decodeOne('autocomplete', value({ id: 7 })).state).toEqual({ type: 'leaf', value: FilterValue.value({ id: 7 }) });
            expect(decodeOne('text', value(12)).state).toEqual({ type: 'leaf', value: FilterValue.value(12) });
            expect(decodeOne('number', value('12')).state).toEqual({ type: 'leaf', value: FilterValue.value('12') });
            expect(decodeOne('custom', value({ anything: [1] })).state).toEqual({ type: 'leaf', value: FilterValue.value({ anything: [1] }) });
            expect(warn).not.toHaveBeenCalled();
        });

        it.each([
            ['dropdown', value([68, 69])],
            ['autocomplete', value([{ id: 7 }])],
            ['text', value(['a'])],
            ['number', legacy({ amount: 1 })],
            ['date', value(1767225600000)],
            ['operatorOverText', value({ operator: '_eq', value: { type: 'value', value: ['a', 'b'] } })]
        ])('resets a %s filter whose stored value does not fit it, and tells which', (filterId, stored) => {
            const decoded = decodeFilterState({ [filterId]: stored, multiselect: value([68]) }, groups);

            // As if nothing was stored for it
            expect(decoded.state.get(filterId)).toEqual(decodeFilterState({}, groups).state.get(filterId));
            expect(decoded.resetFilterIds).toEqual([filterId]);
            // The other filters are read as stored
            expect(decoded.state.get('multiselect')).toEqual({ type: 'leaf', value: FilterValue.value([68]) });
            expect(warn).toHaveBeenCalledTimes(1);
        });
    });
});

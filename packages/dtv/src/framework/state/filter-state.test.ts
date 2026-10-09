import { describe, it, expect } from '@jest/globals';
import { filterStatesEqual, FilterState } from './filter-state';
import * as FilterValue from '../filterValue';

describe('state', () => {
    describe('filterStatesEqual', () => {
        it('compares equivalent filter state maps structurally', () => {
            const left: FilterState = new Map([
                ['simple', { type: 'leaf', value: FilterValue.value('test@example.com') }],
                ['nested', {
                    type: 'and',
                    children: [
                        { type: 'leaf', value: FilterValue.value(new Date('2026-01-02T03:04:05.000Z')) },
                        {
                            type: 'not',
                            child: {
                                type: 'leaf',
                                value: FilterValue.value({ operator: '_eq', value: FilterValue.value(['A', 'B']) })
                            }
                        }
                    ]
                }]
            ]);
            const right: FilterState = new Map([
                ['nested', {
                    type: 'and',
                    children: [
                        { type: 'leaf', value: FilterValue.value(new Date('2026-01-02T03:04:05.000Z')) },
                        {
                            type: 'not',
                            child: {
                                type: 'leaf',
                                value: FilterValue.value({ operator: '_eq', value: FilterValue.value(['A', 'B']) })
                            }
                        }
                    ]
                }],
                ['simple', { type: 'leaf', value: FilterValue.value('test@example.com') }]
            ]);

            expect(filterStatesEqual(left, right)).toBe(true);
        });

        it('detects different filter ids, tree shapes, and values', () => {
            const base: FilterState = new Map([
                ['email', { type: 'leaf', value: FilterValue.value('a@example.com') }]
            ]);

            expect(filterStatesEqual(base, new Map([
                ['other', { type: 'leaf', value: FilterValue.value('a@example.com') }]
            ]))).toBe(false);
            expect(filterStatesEqual(base, new Map([
                ['email', { type: 'not', child: { type: 'leaf', value: FilterValue.value('a@example.com') } }]
            ]))).toBe(false);
            expect(filterStatesEqual(base, new Map([
                ['email', { type: 'leaf', value: FilterValue.value('b@example.com') }]
            ]))).toBe(false);
        });
    });
});

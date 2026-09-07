/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from '@jest/globals';
import type { FilterSchema } from '../framework/filters';
import * as FilterValue from '../framework/filterValue';
import { getFilterStatePillItems } from './filterStatePills.utils';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';

describe('getFilterStatePillItems', () => {
    it('omits AND when an and-expression has only one non-empty child', () => {
        const filters: FilterSchema[] = [
            {
                id: 'compound',
                label: 'Compound',
                aiGenerated: false,
                expression: {
                    type: 'and',
                    filters: [
                        {
                            type: 'equals',
                            field: 'email',
                            value: { type: 'text' }
                        },
                        {
                            type: 'equals',
                            field: 'status',
                            value: { type: 'text' }
                        }
                    ]
                }
            }
        ];

        const items = getFilterStatePillItems(new Map([
            ['compound', {
                type: 'and' as const,
                children: [
                    { type: 'leaf' as const, value: FilterValue.value('jane@example.com') },
                    { type: 'leaf' as const, value: FilterValue.empty }
                ]
            }]
        ]), filters);

        expect(items).toEqual([
            {
                filterId: 'compound',
                displayText: 'email = jane@example.com'
            }
        ]);
    });

    it('omits OR when an or-expression has only one non-empty child', () => {
        const filters: FilterSchema[] = [
            {
                id: 'compound',
                label: 'Compound',
                aiGenerated: false,
                expression: {
                    type: 'or',
                    filters: [
                        {
                            type: 'equals',
                            field: 'email',
                            value: { type: 'text' }
                        },
                        {
                            type: 'equals',
                            field: 'status',
                            value: { type: 'text' }
                        }
                    ]
                }
            }
        ];

        const items = getFilterStatePillItems(new Map([
            ['compound', {
                type: 'or' as const,
                children: [
                    { type: 'leaf' as const, value: FilterValue.empty },
                    { type: 'leaf' as const, value: FilterValue.value('active') }
                ]
            }]
        ]), filters);

        expect(items).toEqual([
            {
                filterId: 'compound',
                displayText: 'status = active'
            }
        ]);
    });

    it('renders a single-value in-expression as equals', () => {
        const filters: FilterSchema[] = [
            {
                id: 'status',
                label: 'Status',
                aiGenerated: false,
                expression: {
                    type: 'in',
                    field: 'status',
                    value: {
                        type: 'multiselect',
                        items: [
                            { label: 'Active', value: 'active' },
                            { label: 'Archived', value: 'archived' }
                        ]
                    }
                }
            }
        ];

        const items = getFilterStatePillItems(new Map([
            ['status', {
                type: 'leaf' as const,
                value: FilterValue.value(['active'])
            }]
        ]), filters);

        expect(items).toEqual([
            {
                filterId: 'status',
                displayText: 'status = Active'
            }
        ]);
    });

    it('renders customOperator using the canonical operator and inner value', () => {
        const filters: FilterSchema[] = [
            {
                id: 'email-custom',
                label: 'Email custom',
                aiGenerated: false,
                expression: {
                    type: 'equals',
                    field: 'email',
                    value: {
                        type: 'customOperator',
                        operators: [
                            { label: 'equals', value: '_eq' },
                            { label: 'starts with', value: '_like' }
                        ],
                        valueControl: { type: 'text' }
                    },
                    transform: {
                        toQuery: () => {
                            throw new Error('display should not consult customOperator query transforms');
                        }
                    }
                }
            }
        ];

        const items = getFilterStatePillItems(new Map([
            ['email-custom', {
                type: 'leaf' as const,
                value: FilterValue.value({
                    operator: '_like',
                    value: FilterValue.value('foo@example.com')
                })
            }]
        ]), filters);

        expect(items).toEqual([
            {
                filterId: 'email-custom',
                displayText: 'email starts with foo@example.com'
            }
        ]);
    });

    it('shows a leaf\'s fieldLabel in place of its field path', () => {
        const filters: FilterSchema[] = [
            {
                id: 'subsidiary',
                label: 'Subsidiary',
                aiGenerated: false,
                expression: {
                    type: 'in',
                    // The transform builds the condition from a path of its
                    // own, so the pill has a label to show instead.
                    field: 'subsidiaryId',
                    fieldLabel: 'Subsidiary',
                    value: {
                        type: 'multiselect',
                        items: [
                            { label: 'Boozt AB', value: 1 },
                            { label: 'Booztlet AB', value: 2 }
                        ]
                    }
                }
            }
        ];

        const items = getFilterStatePillItems(new Map([
            ['subsidiary', { type: 'leaf' as const, value: FilterValue.value([1]) }]
        ]), filters);

        expect(items).toEqual([
            {
                filterId: 'subsidiary',
                displayText: 'Subsidiary = Boozt AB'
            }
        ]);
    });

    it('labels both bounds of a range built by the DSL', () => {
        const expression = FilterExpr.range({
            field: 'amount',
            control: FilterControl.number,
            fieldLabel: 'Amount'
        });
        const filters: FilterSchema[] = [
            { id: 'amount', label: 'Amount', aiGenerated: false, expression }
        ];

        const items = getFilterStatePillItems(new Map([
            ['amount', {
                type: 'and' as const,
                children: [
                    { type: 'leaf' as const, value: FilterValue.value(10) },
                    { type: 'leaf' as const, value: FilterValue.value(20) }
                ]
            }]
        ]), filters);

        expect(items).toEqual([
            {
                filterId: 'amount',
                displayText: 'AND(Amount \u2265 10, Amount \u2264 20)'
            }
        ]);
    });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createDefaultAppState, setSelectedViewId, setDataRows, setFilterGroups, setFilterState, setAppliedFilterState, setSearchQuery, setFilterGroupExpanded, filterStatesEqual, FilterState } from './state';
import { buildInitialFormState, useAppState } from './state';
import { View } from './view';
import * as FilterValue from './filterValue';

// Mock view definitions
const mockViews: View[] = [
    {
        id: 'foo',
        title: 'Foo',
        filterGroups: [
            {
                name: 'default',
                label: 'Default',
                filters: [
                    { id: 'filter-a', label: 'A', expression: { type: 'isNull', field: 'a', value: { type: 'text' } }, aiGenerated: false }
                ]
            }
        ],
        columnDefinitions: [],
        paginationKey: 'id',
    } as any,
    {
        id: 'bar',
        title: 'Bar',
        filterGroups: [
            {
                name: 'default',
                label: 'Default',
                filters: [
                    { id: 'filter-b', label: 'B', expression: { type: 'isNull', field: 'b', value: { type: 'text' } }, aiGenerated: false }
                ]
            }
        ],
        columnDefinitions: [],
        paginationKey: 'id',
    } as any
];

describe('AppState', () => {
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

    it('creates default state with correct initial view and filter state', () => {
        const state = createDefaultAppState(mockViews, []);
        expect(state.selectedViewId).toBe('foo');
        expect(state.views).toBe(mockViews);
        expect(state.filterGroups).toEqual(mockViews[0].filterGroups);
        expect(state.filterState).toEqual(
            new Map(mockViews[0].filterGroups[0].filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
        expect(state.appliedFilterState).toEqual(
            new Map(mockViews[0].filterGroups[0].filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
        expect(state.data).toEqual({ rows: [], flattenedRows: [] });
    });

    it('setSelectedViewId updates selectedViewIndex, filterSchema, and filterState', () => {
        let state = createDefaultAppState(mockViews, []);
        state = setSelectedViewId(state, mockViews[1].id);
        expect(state.selectedViewId).toBe('bar');
        expect(state.filterGroups).toEqual(mockViews[1].filterGroups);
        expect(state.filterState).toEqual(
            new Map(mockViews[1].filterGroups[0].filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
        expect(state.appliedFilterState).toEqual(
            new Map(mockViews[1].filterGroups[0].filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
    });

    it('setDataRows updates data and pagination', () => {
        let state = createDefaultAppState(mockViews, []);
        const data = { rows: [{ id: 1 }, { id: 2 }], flattenedRows: [{ id: { id: 1 } }, { id: { id: 2 } }] };
        const pagination = { page: 2, cursors: ['a', 'b'], rowsPerPage: 20 };
        state = setDataRows(state, data, pagination);
        expect(state.data).toBe(data);
        expect(state.pagination).toEqual(pagination);
    });

    it('setFilterGroups updates filterGroups', () => {
        let state = createDefaultAppState(mockViews, []);
        const newGroups = [
            {
                name: 'default',
                label: 'Default',
                filters: [
                    { id: 'filter-c', label: 'C', expression: { type: 'isNull', field: 'c', value: { type: 'text' } }, aiGenerated: false }
                ]
            }
        ];
        state = setFilterGroups(state, newGroups as any);
        expect(state.filterGroups).toBe(newGroups);
    });

    it('setFilterState updates filterState', () => {
        let state = createDefaultAppState(mockViews, []);
        const newFilterState: FilterState = new Map([['filter1', { key: 'x', value: 42 } as any]]);
        state = setFilterState(state, newFilterState);
        expect(state.filterState).toBe(newFilterState);
        expect(state.appliedFilterState).not.toBe(newFilterState);
    });

    it('setAppliedFilterState updates appliedFilterState', () => {
        let state = createDefaultAppState(mockViews, []);
        const newAppliedFilterState: FilterState = new Map([['filter1', { key: 'x', value: 42 } as any]]);
        state = setAppliedFilterState(state, newAppliedFilterState);
        expect(state.appliedFilterState).toBe(newAppliedFilterState);
    });

    it('setSearchQuery computes searchResults display state and expands matching groups', () => {
        let state = createDefaultAppState(mockViews, []);

        const schemaWithExtraGroup = [
            {
                name: 'default',
                label: 'Default',
                filters: [
                    { id: 'filter-email', label: 'Email', expression: { type: 'isNull', field: 'email', value: { type: 'text' } }, aiGenerated: false }
                ]
            },
            {
                name: 'extra',
                label: 'Extra Filters',
                filters: [
                    { id: 'filter-phone', label: 'Phone Number', expression: { type: 'isNull', field: 'phone', value: { type: 'text' } }, aiGenerated: false }
                ]
            }
        ];

        state = setFilterGroups(state, schemaWithExtraGroup as any);
        state = setSearchQuery(state, 'Phone');

        expect(state.searchQuery).toBe('Phone');
        expect(state.filterDisplayState.type).toBe('searchResults');
        if (state.filterDisplayState.type !== 'searchResults') {
            throw new Error('Expected searchResults display state');
        }
        expect(state.filterDisplayState.filterGroups.flatMap(g => g.filters).map(f => f.id)).toEqual(['filter-phone']);
        expect(state.filterDisplayState.expandedGroups).toEqual(['extra']);
    });

    it('clearing searchQuery resets expanded groups to default collapsed state', () => {
        let state = createDefaultAppState(mockViews, []);
        const schemaWithExtraGroup = [
            {
                name: 'default',
                label: 'Default',
                filters: [
                    { id: 'filter-email', label: 'Email', expression: { type: 'isNull', field: 'email', value: { type: 'text' } }, aiGenerated: false }
                ]
            },
            {
                name: 'extra',
                label: 'Extra Filters',
                filters: [
                    { id: 'filter-phone', label: 'Phone Number', expression: { type: 'isNull', field: 'phone', value: { type: 'text' } }, aiGenerated: false }
                ]
            }
        ];

        state = setFilterGroups(state, schemaWithExtraGroup as any);
        state = setFilterGroupExpanded(state, 'extra', true);
        expect(state.filterDisplayState.expandedGroups).toEqual(['extra']);

        state = setSearchQuery(state, '');
        expect(state.searchQuery).toBe('');
        expect(state.filterDisplayState.type).toBe('all');
        expect(state.filterDisplayState.expandedGroups).toEqual([]);
    });

    it('useAppState returns stable setter references across rerenders', () => {
        const container = document.createElement('div');
        const root = createRoot(container);
        const observedSetFilterState: Array<(filterState: FilterState) => void> = [];
        const observedSetSelectedViewId: Array<(id: string) => void> = [];

        function Harness({ tick }: { tick: number }) {
            const { setFilterState, setSelectedViewId } = useAppState(mockViews, []);
            observedSetFilterState.push(setFilterState);
            observedSetSelectedViewId.push(setSelectedViewId as (id: string) => void);
            return React.createElement('div', { 'data-tick': tick });
        }

        act(() => {
            root.render(React.createElement(Harness, { tick: 1 }));
        });

        act(() => {
            root.render(React.createElement(Harness, { tick: 2 }));
        });

        expect(observedSetFilterState).toHaveLength(2);
        expect(observedSetSelectedViewId).toHaveLength(2);
        expect(observedSetFilterState[0]).toBe(observedSetFilterState[1]);
        expect(observedSetSelectedViewId[0]).toBe(observedSetSelectedViewId[1]);

        act(() => {
            root.unmount();
        });
    });
});

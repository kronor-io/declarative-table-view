/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { createDefaultAppState, setSelectedViewId, setDataRows, setFilterSchema, setFilterState, setSearchQuery, setFilterGroupExpanded, FilterState } from './state';
import { buildInitialFormState } from './state';
import { View } from './view';

// Mock view definitions
const mockViews: View[] = [
    {
        id: 'foo',
        title: 'Foo',
        filterSchema: {
            groups: [{ name: 'default', label: 'Default' }],
            filters: [
                { id: 'filter-a', label: 'A', expression: { type: 'isNull', key: 'a', value: {} }, group: 'default' }
            ]
        },
        columnDefinitions: [],
        paginationKey: 'id',
    } as any,
    {
        id: 'bar',
        title: 'Bar',
        filterSchema: {
            groups: [{ name: 'default', label: 'Default' }],
            filters: [
                { id: 'filter-b', label: 'B', expression: { type: 'isNull', key: 'b', value: {} }, group: 'default' }
            ]
        },
        columnDefinitions: [],
        paginationKey: 'id',
    } as any
];

describe('AppState', () => {
    it('creates default state with correct initial view and filter state', () => {
        const state = createDefaultAppState(mockViews, []);
        expect(state.selectedViewId).toBe('foo');
        expect(state.views).toBe(mockViews);
        expect(state.filterSchemasAndGroups).toEqual(mockViews[0].filterSchema);
        expect(state.filterState).toEqual(
            new Map(mockViews[0].filterSchema.filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
        expect(state.data).toEqual({ rows: [], flattenedRows: [] });
    });

    it('setSelectedViewId updates selectedViewIndex, filterSchema, and filterState', () => {
        let state = createDefaultAppState(mockViews, []);
        state = setSelectedViewId(state, mockViews[1].id);
        expect(state.selectedViewId).toBe('bar');
        expect(state.filterSchemasAndGroups).toEqual(mockViews[1].filterSchema);
        expect(state.filterState).toEqual(
            new Map(mockViews[1].filterSchema.filters.map(f => [f.id, buildInitialFormState(f.expression)]))
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

    it('setFilterSchema updates filterSchema', () => {
        let state = createDefaultAppState(mockViews, []);
        const newSchema = {
            groups: [{ name: 'default', label: 'Default' }],
            filters: [
                { id: 'filter-c', label: 'C', expression: { type: 'isNull', key: 'c', value: null }, group: 'default' }
            ]
        };
        state = setFilterSchema(state, newSchema as any);
        expect(state.filterSchemasAndGroups).toBe(newSchema);
    });

    it('setFilterState updates filterState', () => {
        let state = createDefaultAppState(mockViews, []);
        const newFilterState: FilterState = new Map([['filter1', { key: 'x', value: 42 } as any]]);
        state = setFilterState(state, newFilterState);
        expect(state.filterState).toBe(newFilterState);
    });

    it('setSearchQuery computes searchResults display state and expands matching groups', () => {
        let state = createDefaultAppState(mockViews, []);

        const schemaWithExtraGroup = {
            groups: [
                { name: 'default', label: 'Default' },
                { name: 'extra', label: 'Extra Filters' }
            ],
            filters: [
                { id: 'filter-email', label: 'Email', expression: { type: 'isNull', key: 'email', value: {} }, group: 'default' },
                { id: 'filter-phone', label: 'Phone Number', expression: { type: 'isNull', key: 'phone', value: {} }, group: 'extra' }
            ]
        };

        state = setFilterSchema(state, schemaWithExtraGroup as any);
        state = setSearchQuery(state, 'Phone');

        expect(state.searchQuery).toBe('Phone');
        expect(state.filterDisplayState.type).toBe('searchResults');
        if (state.filterDisplayState.type !== 'searchResults') {
            throw new Error('Expected searchResults display state');
        }
        expect(state.filterDisplayState.schemasAndGroups.filters.map(f => f.id)).toEqual(['filter-phone']);
        expect(state.filterDisplayState.expandedGroups).toEqual(['extra']);
    });

    it('clearing searchQuery resets expanded groups to default collapsed state', () => {
        let state = createDefaultAppState(mockViews, []);
        const schemaWithExtraGroup = {
            groups: [
                { name: 'default', label: 'Default' },
                { name: 'extra', label: 'Extra Filters' }
            ],
            filters: [
                { id: 'filter-email', label: 'Email', expression: { type: 'isNull', key: 'email', value: {} }, group: 'default' },
                { id: 'filter-phone', label: 'Phone Number', expression: { type: 'isNull', key: 'phone', value: {} }, group: 'extra' }
            ]
        };

        state = setFilterSchema(state, schemaWithExtraGroup as any);
        state = setFilterGroupExpanded(state, 'extra', true);
        expect(state.filterDisplayState.expandedGroups).toEqual(['extra']);

        state = setSearchQuery(state, '');
        expect(state.searchQuery).toBe('');
        expect(state.filterDisplayState.type).toBe('all');
        expect(state.filterDisplayState.expandedGroups).toEqual([]);
    });
});

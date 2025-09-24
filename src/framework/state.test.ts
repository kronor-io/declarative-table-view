/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { createDefaultAppState, setSelectedViewIndex, setDataRows, setFilterSchema, setFilterState, FilterState } from './state';
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
        const state = createDefaultAppState(mockViews);
        expect(state.selectedViewIndex).toBe(0);
        expect(state.views).toBe(mockViews);
        expect(state.filterSchemasAndGroups).toEqual(mockViews[0].filterSchema);
        expect(state.filterState).toEqual(
            new Map(mockViews[0].filterSchema.filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
        expect(state.data).toEqual({ rows: [], flattenedRows: [] });
    });

    it('setSelectedViewIndex updates selectedViewIndex, filterSchema, and filterState', () => {
        let state = createDefaultAppState(mockViews);
        state = setSelectedViewIndex(state, 1);
        expect(state.selectedViewIndex).toBe(1);
        expect(state.filterSchemasAndGroups).toEqual(mockViews[1].filterSchema);
        expect(state.filterState).toEqual(
            new Map(mockViews[1].filterSchema.filters.map(f => [f.id, buildInitialFormState(f.expression)]))
        );
    });

    it('setDataRows updates data and pagination', () => {
        let state = createDefaultAppState(mockViews);
        const data = { rows: [{ id: 1 }, { id: 2 }], flattenedRows: [[{ id: 1 }], [{ id: 2 }]] };
        const pagination = { page: 2, cursors: ['a', 'b'] };
        state = setDataRows(state, data, pagination);
        expect(state.data).toBe(data);
        expect(state.pagination).toEqual(pagination);
    });

    it('setFilterSchema updates filterSchema', () => {
        let state = createDefaultAppState(mockViews);
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
        let state = createDefaultAppState(mockViews);
        const newFilterState: FilterState = new Map([['filter1', { key: 'x', value: 42 } as any]]);
        state = setFilterState(state, newFilterState);
        expect(state.filterState).toBe(newFilterState);
    });
});

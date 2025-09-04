/**
 * @jest-environment jsdom
 */
import { getInitialViewIndex } from './state';
import { describe, it, expect } from '@jest/globals';
import { View } from './view';

describe('getInitialViewIndex', () => {
    const views: View[] = [
        { id: 'foo', title: 'Foo', filterSchema: { groups: [], filters: [] }, columnDefinitions: [], paginationKey: 'id' } as any,
        { id: 'bar', title: 'Bar', filterSchema: { groups: [], filters: [] }, columnDefinitions: [], paginationKey: 'id' } as any
    ];

    it('returns 0 and updates URL if no view param', () => {
        const originalSearch = window.location.search;
        window.history.replaceState({}, '', '/');
        const idx = getInitialViewIndex(views);
        expect(idx).toBe(0);
        expect(window.location.search).toBe('?view=foo');
        window.history.replaceState({}, '', originalSearch);
    });

    it('returns correct index for valid view param', () => {
        const originalSearch = window.location.search;
        window.history.replaceState({}, '', '/?view=bar');
        const idx = getInitialViewIndex(views);
        expect(idx).toBe(1);
        window.history.replaceState({}, '', originalSearch);
    });

    it('returns 0 and updates URL for invalid view param', () => {
        const originalSearch = window.location.search;
        window.history.replaceState({}, '', '/?view=notfound');
        const idx = getInitialViewIndex(views);
        expect(idx).toBe(0);
        expect(window.location.search).toBe('?view=foo');
        window.history.replaceState({}, '', originalSearch);
    });
});

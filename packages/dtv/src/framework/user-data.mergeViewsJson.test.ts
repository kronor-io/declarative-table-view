import { describe, expect, it } from '@jest/globals';
import { mergeViewsJson, type ViewDataJson } from './user-data';

const view = (hiddenColumns: string[]): ViewDataJson => ({
    columnOrder: null,
    hiddenColumns,
    rowsPerPage: null,
    syncFilterStateToUserData: true,
    persistedFilterState: null,
    savedFilters: []
});

describe('mergeViewsJson', () => {
    it('lets later layers win per view and keeps views only earlier layers know', () => {
        const merged = mergeViewsJson(
            { a: view(['old-a']), b: view(['old-b']) },
            undefined,
            { b: view(['remote-b']), c: view(['remote-c']) },
            null,
            { c: view(['new-c']) }
        );

        expect(merged).toEqual({ a: view(['old-a']), b: view(['remote-b']), c: view(['new-c']) });
    });

    it('is empty without layers', () => {
        expect(mergeViewsJson()).toEqual({});
        expect(mergeViewsJson(null, undefined)).toEqual({});
    });
});

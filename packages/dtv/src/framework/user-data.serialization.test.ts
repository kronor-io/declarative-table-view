/**
 * @jest-environment jsdom
 */

import { defaultUserPreferences, defaultViewData, encodeUserData, readUserData, type UserData } from './user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import { parseFilterFormState } from './filter-form-state';
import type { FilterGroups } from './filters';
import { isSuccess, unwrapResult } from './result';

const basicSchema: FilterGroups = [
    {
        name: 'default',
        label: null,
        filters: [
            {
                id: 'email-filter',
                label: 'Email Filter',
                expression: {
                    type: 'equals',
                    field: 'email',
                    value: { type: 'text' }
                },
                aiGenerated: false
            }
        ]
    }
];

const viewJson = (fields: Record<string, unknown>) => ({
    columnOrder: null,
    hiddenColumns: [],
    rowsPerPage: null,
    savedFilters: [],
    ...fields
});

function read(json: unknown, schemas: Record<string, FilterGroups>): UserData {
    return unwrapResult(readUserData(json, schemas)).userData;
}

describe('user-data serialization', () => {
    it('roundtrips savedFilters createdAt Date <-> string', () => {
        const filterState = parseFilterFormState({}, basicSchema);

        const data: UserData = {
            preferences: defaultUserPreferences,
            views: {
                'view-a': {
                    columnOrder: ['c1'],
                    hiddenColumns: ['h1'],
                    rowsPerPage: 50,
                    syncFilterStateToUserData: true,
                    persistedFilterState: filterState,
                    savedFilters: [
                        {
                            id: 'sf-1',
                            name: 'Filter 1',
                            view: 'view-a',
                            state: filterState,
                            createdAt: new Date('2026-01-02T03:04:05.000Z'),
                            formatRevision: 'rev'
                        }
                    ]
                }
            },
            retainedViews: {},
            revision: 0,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        };

        const json = encodeUserData(data, { 'view-a': basicSchema });
        expect(json.views['view-a'].syncFilterStateToUserData).toBe(true);
        expect(json.views['view-a'].persistedFilterState).toEqual({});
        expect(json.views['view-a'].definitionRevision).toBe(1);
        expect(json.views['view-a'].savedFilters[0].createdAt).toBe('2026-01-02T03:04:05.000Z');

        const roundtripped = read(JSON.parse(JSON.stringify(json)), { 'view-a': basicSchema });
        const createdAt = roundtripped.views['view-a'].savedFilters[0].createdAt;
        expect(createdAt instanceof Date).toBe(true);
        expect(createdAt.toISOString()).toBe('2026-01-02T03:04:05.000Z');
        expect(roundtripped.views['view-a'].syncFilterStateToUserData).toBe(true);
        expect(roundtripped.views['view-a'].persistedFilterState).toEqual(filterState);
    });

    it('roundtrips closeFilterPanelOnApply when present', () => {
        const json = encodeUserData({
            preferences: {
                ...defaultUserPreferences,
                closeFilterPanelOnApply: true
            },
            views: {},
            retainedViews: {},
            revision: 1,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        }, {});

        expect(json.preferences).toEqual({
            syncFilterStateToUrlOverride: null,
            closeFilterPanelOnApply: true
        });

        const roundtripped = read(json, {});
        expect(roundtripped.preferences).toEqual({
            syncFilterStateToUrlOverride: null,
            closeFilterPanelOnApply: true
        });
    });

    it('defaults missing per-view filter-state persistence to enabled', () => {
        const roundtripped = read({
            preferences: defaultUserPreferences,
            views: { 'view-a': viewJson({}) },
            revision: 0,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        }, { 'view-a': basicSchema });

        expect(roundtripped.views['view-a'].syncFilterStateToUserData).toBe(true);
    });

    it('preserves explicit opt-out for per-view filter-state persistence', () => {
        const roundtripped = read({
            preferences: defaultUserPreferences,
            views: { 'view-a': viewJson({ syncFilterStateToUserData: false }) },
            revision: 0,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        }, { 'view-a': basicSchema });

        expect(roundtripped.views['view-a'].syncFilterStateToUserData).toBe(false);
    });

    it('retains views without a schema here and writes them back unchanged, unknown fields included', () => {
        const otherView = viewJson({ hiddenColumns: ['x'], definitionRevision: 1, addedByALaterVersion: { a: 1 } });
        const stored = {
            preferences: defaultUserPreferences,
            views: { 'view-a': viewJson({}), 'other-view': otherView },
            revision: 3,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        };

        const data = read(stored, { 'view-a': basicSchema });
        expect(Object.keys(data.views)).toEqual(['view-a']);
        expect(Object.keys(data.retainedViews)).toEqual(['other-view']);

        const written = encodeUserData(data, { 'view-a': basicSchema });
        expect(written.views['other-view']).toEqual({ ...otherView, syncFilterStateToUserData: true, persistedFilterState: null });
        expect(JSON.parse(JSON.stringify(written.views['other-view'])).addedByALaterVersion).toEqual({ a: 1 });
    });

    it('retains a view written for a newer definition revision and never overwrites it', () => {
        const newer = viewJson({ hiddenColumns: ['newer'], definitionRevision: 2 });
        const data = read({
            preferences: defaultUserPreferences,
            views: { 'view-a': newer },
            revision: 3,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        }, { 'view-a': basicSchema });

        expect(data.views['view-a']).toBeUndefined();

        // A write of this version's view data does not replace it.
        const written = encodeUserData({
            ...data,
            views: { 'view-a': { ...defaultViewData(), hiddenColumns: ['older'] } }
        }, { 'view-a': basicSchema });
        expect(written.views['view-a'].hiddenColumns).toEqual(['newer']);
        expect(written.views['view-a'].definitionRevision).toBe(2);
    });

    it('layers stored views below retained and decoded ones', () => {
        const data = read({
            preferences: defaultUserPreferences,
            views: { 'view-a': viewJson({ hiddenColumns: ['mine'] }), 'remote-only': viewJson({ hiddenColumns: ['remote'] }) },
            revision: 3,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        }, { 'view-a': basicSchema });

        const base = {
            'view-a': { ...viewJson({ hiddenColumns: ['stale'] }), syncFilterStateToUserData: true, persistedFilterState: null, definitionRevision: 1 },
            'remote-only': { ...viewJson({ hiddenColumns: ['stale'] }), syncFilterStateToUserData: true, persistedFilterState: null, definitionRevision: 1 },
            'local-only': { ...viewJson({ hiddenColumns: ['local'] }), syncFilterStateToUserData: true, persistedFilterState: null, definitionRevision: 1 }
        };
        const written = encodeUserData(data, { 'view-a': basicSchema }, base);

        expect(written.views['view-a'].hiddenColumns).toEqual(['mine']);
        expect(written.views['remote-only'].hiddenColumns).toEqual(['remote']);
        expect(written.views['local-only'].hiddenColumns).toEqual(['local']);
    });

    it('fails on data that is not user data, and on unknown format revisions', () => {
        const notAnObject = readUserData('nope', {});
        expect(!isSuccess(notAnObject) && notAnObject.error.kind).toBe('malformed');

        const newerFormat = readUserData({ views: {}, formatRevision: '2099-01-01T00:00:00.000Z' }, {});
        expect(!isSuccess(newerFormat) && newerFormat.error.kind).toBe('migrationFailed');
    });
});

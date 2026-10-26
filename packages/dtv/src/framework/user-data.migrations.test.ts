/**
 * @jest-environment jsdom
 */
import { applyUserDataMigrations, CURRENT_USERDATA_FORMAT_REVISION, REVISION_2026_05_06, SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY } from './user-data.migrations';
import { __applyUserDataMigrationsWithStepsForTest } from './user-data.migrations';
import { defaultUserPreferences, INITIAL_USERDATA_FORMAT_REVISION, REVISION_2026_01_05, REVISION_2026_03_26 } from './user-data';
import type { FilterGroups } from './filters';
import { SAVED_FILTERS_KEY } from './saved-filters';
import { isFailure, isSuccess } from './result';

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

describe('user-data migrations', () => {
    let mockLocalStorage: { [key: string]: string };
    let consoleSpy: jest.SpyInstance;

    function loadUserDataManager() {
        jest.resetModules();
        return import('./user-data-manager').then(({ createUserDataManager }) => ({
            userData: createUserDataManager({
                'view-a': basicSchema,
                'view-b': basicSchema,
                'test-view': basicSchema
            }, { showToast: () => { } })
        }));
    }

    beforeEach(() => {
        mockLocalStorage = {};
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn((key: string) => mockLocalStorage[key] ?? null),
                setItem: jest.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
                removeItem: jest.fn((key: string) => { delete mockLocalStorage[key]; })
            },
            writable: true
        });

        // Silence expected migration warning logs
        consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleSpy?.mockRestore();
        jest.clearAllMocks();
    });

    it('applyUserDataMigrations short-circuits when already at current revision', () => {
        const json = { preferences: defaultUserPreferences, views: {}, revision: 0, formatRevision: CURRENT_USERDATA_FORMAT_REVISION };
        const migrated = applyUserDataMigrations(json);
        expect(migrated).toEqual({ tag: 'success', value: json });
        expect(isSuccess(migrated) && migrated.value).toBe(json);
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('imports legacy savedFilters into user-data on load', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {},
            formatRevision: INITIAL_USERDATA_FORMAT_REVISION
        });

        // Set up legacy saved filters key (dtvSavedFilters)
        mockLocalStorage[SAVED_FILTERS_KEY] = JSON.stringify([
            {
                id: 'sf-1',
                name: 'Legacy 1',
                view: 'view-a',
                state: {},
                createdAt: '2026-01-02T00:00:00.000Z',
                formatRevision: '2025-09-19T00:00:00.000Z'
            },
            {
                id: 'sf-2',
                name: 'Legacy 2',
                view: 'view-b',
                state: {},
                createdAt: '2026-01-03T00:00:00.000Z',
                formatRevision: '2025-09-19T00:00:00.000Z'
            }
        ]);

        const { userData } = await loadUserDataManager();

        const a = userData.getViewData('view-a');
        const b = userData.getViewData('view-b');

        expect(a.savedFilters.map(f => f.id)).toEqual(['sf-1']);
        expect(b.savedFilters.map(f => f.id)).toEqual(['sf-2']);
        expect(a.savedFilters[0].createdAt instanceof Date).toBe(true);

        // Legacy key stays for now; we just mark that we've migrated it.
        expect(mockLocalStorage[SAVED_FILTERS_KEY]).toBeTruthy();
        expect(mockLocalStorage[SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY]).toBe('true');
        expect(window.localStorage.removeItem).not.toHaveBeenCalledWith(SAVED_FILTERS_KEY);

        // Migrations should reach CURRENT_USERDATA_REVISION cleanly.
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('imports legacy savedFilters of views this app does not define, and keeps them', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {},
            formatRevision: INITIAL_USERDATA_FORMAT_REVISION
        });
        mockLocalStorage[SAVED_FILTERS_KEY] = JSON.stringify([
            { id: 'sf-other', name: 'Other app', view: 'other-view', state: {}, createdAt: '2026-01-02T00:00:00.000Z', formatRevision: 'rev' }
        ]);

        const { userData } = await loadUserDataManager();
        await userData.ready;

        const stored = JSON.parse(mockLocalStorage['dtvUserData']);
        expect(stored.views['other-view'].savedFilters.map((f: { id: string }) => f.id)).toEqual(['sf-other']);
    });

    it('skips invalid legacy saved filter entries', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {},
            formatRevision: INITIAL_USERDATA_FORMAT_REVISION
        });

        mockLocalStorage[SAVED_FILTERS_KEY] = JSON.stringify([
            null,
            123,
            {},
            { id: 'x', name: 'Missing view', createdAt: '2026-01-02T00:00:00.000Z', formatRevision: 'rev', state: {} },
            { view: 'view-a', name: 'Missing id', createdAt: '2026-01-02T00:00:00.000Z', formatRevision: 'rev', state: {} },
            { view: 'view-a', id: 'ok', name: 'Ok', createdAt: '2026-01-02T00:00:00.000Z', formatRevision: 'rev', state: {} }
        ]);

        const { userData } = await loadUserDataManager();
        expect(userData.getViewData('view-a').savedFilters.map(f => f.id)).toEqual(['ok']);
        expect(mockLocalStorage[SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY]).toBe('true');
    });

    it('handles legacy savedFilters JSON parse errors', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {},
            formatRevision: INITIAL_USERDATA_FORMAT_REVISION
        });

        mockLocalStorage[SAVED_FILTERS_KEY] = '{ not valid json';
        await loadUserDataManager();
        expect(consoleSpy).toHaveBeenCalledWith(
            'Failed migrating legacy saved filters into user data:',
            expect.any(Error)
        );

        // Parse failure should not mark the migration as completed.
        expect(mockLocalStorage[SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY]).toBeUndefined();
    });

    it('dedupes legacy ids that collide with existing user-data savedFilters', async () => {
        // Ensure crypto.randomUUID is deterministic in test
        const deterministicUuid = '00000000-0000-4000-8000-000000000001' as const;
        const randomUuidSpy = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(deterministicUuid);

        // Stored user data at an old revision, so migrations run
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {
                'view-a': {
                    columnOrder: null,
                    hiddenColumns: [],
                    rowsPerPage: null,
                    syncFilterStateToUserData: false,
                    persistedFilterState: null,
                    savedFilters: [
                        { id: 'dup', name: 'Existing', view: 'view-a', state: {}, createdAt: '2026-01-01T00:00:00.000Z', formatRevision: 'rev' }
                    ]
                }
            },
            revision: 0,
            formatRevision: INITIAL_USERDATA_FORMAT_REVISION
        });

        // Legacy filter has colliding id
        mockLocalStorage[SAVED_FILTERS_KEY] = JSON.stringify([
            {
                id: 'dup',
                name: 'Legacy Collide',
                view: 'view-a',
                state: {},
                createdAt: '2026-01-04T00:00:00.000Z',
                formatRevision: 'rev'
            }
        ]);

        const { userData } = await loadUserDataManager();
        const ids = userData.getViewData('view-a').savedFilters.map(f => f.id);
        expect(ids).toEqual(['dup', deterministicUuid]);
        expect(randomUuidSpy).toHaveBeenCalled();
        randomUuidSpy.mockRestore();
    });

    it('applyUserDataMigrations returns failure when starting revision is not the expected fromRevision', () => {
        const result = applyUserDataMigrations({ views: {}, formatRevision: '2025-01-01T00:00:00.000Z' })

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) {
            expect(result.error.kind).toBe('unknownRevision')
        }
    });

    it('applyUserDataMigrations can start from an intermediate revision when new steps are appended', () => {
        const REV_A = '2026-01-01T00:00:00.000Z'
        const REV_B = CURRENT_USERDATA_FORMAT_REVISION

        // Simulate persisted user-data that was already migrated to REV_A in a prior release.
        // A later release appends stepAtoB and should migrate starting from REV_A.
        const result = __applyUserDataMigrationsWithStepsForTest(
            { views: {}, formatRevision: REV_A },
            [
                {
                    fromRevision: INITIAL_USERDATA_FORMAT_REVISION,
                    toRevision: REV_A,
                    migrate: json => ({ ...json, stepA: true })
                },
                {
                    fromRevision: REV_A,
                    toRevision: REV_B,
                    migrate: json => ({ ...json, stepB: true })
                }
            ]
        )

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
            expect(result.value).toEqual({ views: {}, formatRevision: REV_B, stepB: true })
        }
    })

    it('sets syncFilterStateToUrlOverride to null when migrating', () => {
        const result = applyUserDataMigrations({
            preferences: { syncFilterStateToUrlOverride: true, closeFilterPanelOnApply: false },
            views: {},
            formatRevision: REVISION_2026_01_05
        })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
            // Migration step sets the field to null (use App option) regardless of prior value.
            expect(result.value.preferences).toEqual({ syncFilterStateToUrlOverride: null, closeFilterPanelOnApply: false })
        }
    })

    it('resets persisted filter state when adding per-view filter-state persistence', () => {
        const result = applyUserDataMigrations({
            views: {
                'view-a': {
                    columnOrder: ['col-a'],
                    hiddenColumns: ['col-b'],
                    rowsPerPage: 50,
                    syncFilterStateToUserData: false,
                    persistedFilterState: { stale: true },
                    savedFilters: []
                }
            },
            formatRevision: REVISION_2026_03_26
        })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
            expect(result.value.views).toEqual({
                'view-a': {
                    columnOrder: ['col-a'],
                    hiddenColumns: ['col-b'],
                    rowsPerPage: 50,
                    syncFilterStateToUserData: false,
                    persistedFilterState: null,
                    savedFilters: [],
                    definitionRevision: 1
                }
            })
        }
    })

    it('stamps every view with the baseline definition revision, schema or not', () => {
        const result = applyUserDataMigrations({
            views: {
                'view-a': { savedFilters: [] },
                'some-other-apps-view': { hiddenColumns: ['x'] },
                'not-a-view': 42
            },
            formatRevision: REVISION_2026_05_06
        })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
            expect(result.value).toEqual({
                views: {
                    'view-a': { savedFilters: [], definitionRevision: 1 },
                    'some-other-apps-view': { hiddenColumns: ['x'], definitionRevision: 1 },
                    'not-a-view': 42
                },
                formatRevision: CURRENT_USERDATA_FORMAT_REVISION
            })
        }
    })

    it('uses the new per-view filter-state persistence default when migrating unset legacy data', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {
                'view-a': {
                    columnOrder: ['col-a'],
                    hiddenColumns: ['col-b'],
                    rowsPerPage: 50,
                    savedFilters: []
                }
            },
            revision: 0,
            formatRevision: REVISION_2026_03_26
        });

        const { userData } = await loadUserDataManager();

        expect(userData.getViewData('view-a').syncFilterStateToUserData).toBe(true)
    })

    it('user-data-manager falls back to defaults when migration fails (unknown revision)', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: defaultUserPreferences,
            views: {},
            formatRevision: '2025-01-01T00:00:00.000Z'
        });

        mockLocalStorage[SAVED_FILTERS_KEY] = JSON.stringify([
            {
                id: 'sf-1',
                name: 'Legacy 1',
                view: 'view-a',
                state: {},
                createdAt: '2026-01-02T00:00:00.000Z',
                formatRevision: '2025-09-19T00:00:00.000Z'
            }
        ]);

        const { userData } = await loadUserDataManager();
        expect(userData.getViewData('view-a').savedFilters).toEqual([]);
        // user-data-manager reports migration failures via console.error
        expect(consoleSpy).toHaveBeenCalledWith(
            'Failed to read user data:',
            expect.stringContaining('unknown revision'),
            expect.anything()
        );
    });
});

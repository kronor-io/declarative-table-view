/**
 * @jest-environment jsdom
 */
import { applyUserDataMigrations, CURRENT_USERDATA_FORMAT_REVISION, SAVED_FILTERS_MIGRATED_TO_USERDATA_KEY } from './user-data.migrations';
import { defaultUserData, INITIAL_USERDATA_FORMAT_REVISION, toUserDataJson, type UserData } from './user-data';
import type { FilterSchemasAndGroups } from './filters';
import { parseFilterFormState } from './filter-form-state';
import { SAVED_FILTERS_KEY } from './saved-filters';

const basicSchema: FilterSchemasAndGroups = {
    groups: [{ name: 'default', label: null }],
    filters: [
        {
            id: 'email-filter',
            label: 'Email Filter',
            expression: {
                type: 'equals',
                field: 'email',
                value: { type: 'text' }
            },
            group: 'default',
            aiGenerated: false
        }
    ]
};

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
        const data = defaultUserData();
        data.formatRevision = CURRENT_USERDATA_FORMAT_REVISION;
        const migrated = applyUserDataMigrations(data, {
            filterSchemasByViewId: {
                'view-a': basicSchema,
                'view-b': basicSchema,
                'test-view': basicSchema
            }
        });
        expect(migrated).toBe(data);
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('imports legacy savedFilters into user-data on load', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: {},
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

    it('skips invalid legacy saved filter entries', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: {},
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
            preferences: {},
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

        const existingFilterState = parseFilterFormState({}, basicSchema);

        const existing: UserData = {
            preferences: {},
            views: {
                'view-a': {
                    columnOrder: null,
                    hiddenColumns: [],
                    rowsPerPage: null,
                    savedFilters: [
                        {
                            id: 'dup',
                            name: 'Existing',
                            view: 'view-a',
                            state: existingFilterState,
                            createdAt: new Date('2026-01-01T00:00:00.000Z'),
                            formatRevision: 'rev'
                        }
                    ]
                }
            },
            revision: 0,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        };

        // Store valid dtvUserData JSON but force an old revision so migrations run
        const json = toUserDataJson(existing);
        json.formatRevision = INITIAL_USERDATA_FORMAT_REVISION;
        mockLocalStorage['dtvUserData'] = JSON.stringify(json);

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

    it('applyUserDataMigrations throws when starting revision is not the expected fromRevision', () => {
        const data = defaultUserData();
        data.formatRevision = '2025-01-01T00:00:00.000Z';

        expect(() =>
            applyUserDataMigrations(data, {
                filterSchemasByViewId: {
                    'view-a': basicSchema,
                    'view-b': basicSchema,
                    'test-view': basicSchema
                }
            })
        ).toThrow(/User-data migration out of order/);
    });

    it('user-data-manager falls back to defaults when migration throws (unknown revision)', async () => {
        mockLocalStorage['dtvUserData'] = JSON.stringify({
            preferences: {},
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
        expect(consoleSpy).toHaveBeenCalledWith('Failed to read user data:', expect.any(Error));
    });
});

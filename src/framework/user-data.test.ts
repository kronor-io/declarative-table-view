/**
 * @jest-environment jsdom
 */

import type { FilterSchemasAndGroups } from './filters';
import { parseFilterFormState } from './filter-form-state';
import { CURRENT_FORMAT_REVISION } from './saved-filters';

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

function mockLocalStorageWithBackingStore(backingStore: Record<string, string> = {}) {
    Object.defineProperty(window, 'localStorage', {
        value: {
            getItem: jest.fn((key: string) => backingStore[key] ?? null),
            setItem: jest.fn((key: string, value: string) => { backingStore[key] = value; }),
            removeItem: jest.fn((key: string) => { delete backingStore[key]; })
        },
        writable: true
    });
    return backingStore;
}

function loadUserDataManager() {
    jest.resetModules();
    return import('./user-data-manager').then(({ createUserDataManager }) => ({
        userData: createUserDataManager({
            'test-view': basicSchema,
            'view-a': basicSchema,
            'view-b': basicSchema,
            'any': basicSchema
        })
    }));
}

function loadUserDataManagerWithOptions(options: import('./user-data-manager').UserDataManagerOptions) {
    jest.resetModules();
    return import('./user-data-manager').then(({ createUserDataManager }) => ({
        userData: createUserDataManager({
            'test-view': basicSchema,
            'view-a': basicSchema,
            'view-b': basicSchema,
            'any': basicSchema
        }, options)
    }));
}

describe('user-data manager', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns sensible defaults when empty', async () => {
        mockLocalStorageWithBackingStore({});
        const { userData } = await loadUserDataManager();

        expect(userData.getPreferences()).toEqual({});
        expect(userData.getViewData('test-view')).toEqual({ columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [] });
    });

    it('persists per-view updates (single call)', async () => {
        const store = mockLocalStorageWithBackingStore({});
        let { userData } = await loadUserDataManager();

        userData.updateViewData('view-a', (prev) => ({
            ...prev,
            columnOrder: ['col1', 'col2', 'col3'],
            hiddenColumns: ['col9']
        }));

        // Reload module to simulate new session (manager memoizes in module scope)
        mockLocalStorageWithBackingStore(store);
        ({ userData } = await loadUserDataManager());

        const data = userData.getViewData('view-a');
        expect(data).toEqual({ columnOrder: ['col1', 'col2', 'col3'], hiddenColumns: ['col9'], rowsPerPage: null, savedFilters: [] });
    });

    it('persists preferences updates', async () => {
        const store = mockLocalStorageWithBackingStore({});
        let { userData } = await loadUserDataManager();

        userData.updatePreferences((prev) => ({ ...prev, theme: 'dark' }));

        mockLocalStorageWithBackingStore(store);
        ({ userData } = await loadUserDataManager());

        expect(userData.getPreferences()).toEqual({ theme: 'dark' });
    });

    it('handles malformed dtvUserData JSON gracefully', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        mockLocalStorageWithBackingStore({
            dtvUserData: '{ not: valid json'
        });

        const { userData } = await loadUserDataManager();
        expect(userData.getPreferences()).toEqual({});
        expect(userData.getViewData('any')).toEqual({ columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [] });
        expect(consoleSpy).toHaveBeenCalledWith('Failed to parse user data JSON:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('handles localStorage.getItem throwing', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn(() => {
                    throw new Error('boom');
                }),
                setItem: jest.fn(),
                removeItem: jest.fn()
            },
            writable: true
        });

        const { userData } = await loadUserDataManager();
        expect(userData.getViewData('any')).toEqual({ columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [] });
        expect(consoleSpy).toHaveBeenCalledWith('Failed to read localStorage:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('replicates saved filter API (save/load/update/delete)', async () => {
        const deterministicUuid = '00000000-0000-4000-8000-000000000001' as const;
        const randomUuidSpy = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(deterministicUuid);

        const store = mockLocalStorageWithBackingStore({});
        let { userData } = await loadUserDataManager();

        const state = parseFilterFormState({}, basicSchema);
        const saved = userData.createFilter({
            name: 'My Filter',
            view: 'view-a',
            state
        });

        expect(saved.id).toBe(deterministicUuid);
        expect(saved.createdAt instanceof Date).toBe(true);
        expect(saved.formatRevision).toBe(CURRENT_FORMAT_REVISION);

        // Reload module to simulate new session
        mockLocalStorageWithBackingStore(store);
        ({ userData } = await loadUserDataManager());

        const loaded = userData.getSavedFilters('view-a');
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe(deterministicUuid);
        expect(loaded[0].createdAt instanceof Date).toBe(true);

        const updated = userData.updateFilter('view-a', loaded[0].id, { name: 'Renamed' });
        expect(updated?.name).toBe('Renamed');

        // Verify persisted update
        mockLocalStorageWithBackingStore(store);
        ({ userData } = await loadUserDataManager());
        expect(userData.getSavedFilters('view-a')[0].name).toBe('Renamed');

        expect(userData.deleteFilter('view-a', deterministicUuid)).toBe(true);
        expect(userData.getSavedFilters('view-a')).toEqual([]);
        expect(userData.deleteFilter('view-a', 'does-not-exist')).toBe(false);

        randomUuidSpy.mockRestore();
    });

    it('updateFilter returns null when missing', async () => {
        mockLocalStorageWithBackingStore({});
        const { userData } = await loadUserDataManager();

        const state = parseFilterFormState({}, basicSchema);
        const missing = {
            id: 'missing',
            name: 'Missing',
            view: 'view-a',
            state,
            createdAt: new Date(),
            formatRevision: CURRENT_FORMAT_REVISION
        };

        expect(userData.updateFilter('view-a', missing.id, { name: 'Nope' })).toBeNull();
    });

    it('invokes save callback on every save', async () => {
        mockLocalStorageWithBackingStore({});

        const saveSpy = jest.fn(async () => { });
        const { userData } = await loadUserDataManagerWithOptions({ save: saveSpy });

        userData.updatePreferences((prev) => ({ ...prev, theme: 'dark' }));
        userData.updateViewData('view-a', (prev) => ({ ...prev, hiddenColumns: ['x'] }));

        // The manager may persist a migrated/default payload on initialization,
        // so we assert at least the two explicit updates.
        expect(saveSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
            preferences: { theme: 'dark' }
        }));
    });

    it('calls load callback on creation and persists loaded data to localStorage', async () => {
        const store = mockLocalStorageWithBackingStore({});

        const loadSpy = jest.fn(async () => ({
            preferences: { theme: 'remote' },
            views: {
                'view-a': { columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [] }
            },
            revision: 0,
            formatRevision: '1970-01-01T00:00:00.000Z'
        }));
        const saveSpy = jest.fn(async () => { });

        const { userData } = await loadUserDataManagerWithOptions({ load: loadSpy, save: saveSpy });
        await userData.ready;

        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(userData.getPreferences()).toEqual({ theme: 'remote' });

        // Requirement: successful load is also saved to localStorage
        expect(store.dtvUserData).toBeTruthy();
        const parsed = JSON.parse(store.dtvUserData);
        expect(parsed.preferences).toEqual({ theme: 'remote' });

        // Loaded persistence counts as a save
        expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
            preferences: { theme: 'remote' }
        }));
    });

    it('keeps localStorage state when load callback fails', async () => {
        const store = mockLocalStorageWithBackingStore({
            dtvUserData: JSON.stringify({
                preferences: { theme: 'local' },
                views: {},
                revision: 0,
                formatRevision: '1970-01-01T00:00:00.000Z'
            })
        });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const loadSpy = jest.fn(async () => {
            throw new Error('nope');
        });

        const { userData } = await loadUserDataManagerWithOptions({ load: loadSpy });
        await userData.ready;

        expect(userData.getPreferences()).toEqual({ theme: 'local' });
        expect(store.dtvUserData).toBeTruthy();
        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith('User-data load callback failed:', expect.any(Error));
        consoleSpy.mockRestore();
    });
});

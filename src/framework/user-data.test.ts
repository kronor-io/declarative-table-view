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

describe('user-data manager', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns sensible defaults when empty', async () => {
        mockLocalStorageWithBackingStore({});
        const { userData } = await loadUserDataManager();

        expect(userData.getPreferences()).toEqual({});
        expect(userData.getViewData('test-view')).toEqual({ columnOrder: null, hiddenColumns: [], savedFilters: [] });
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
        expect(data).toEqual({ columnOrder: ['col1', 'col2', 'col3'], hiddenColumns: ['col9'], savedFilters: [] });
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
        expect(userData.getViewData('any')).toEqual({ columnOrder: null, hiddenColumns: [], savedFilters: [] });
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
        expect(userData.getViewData('any')).toEqual({ columnOrder: null, hiddenColumns: [], savedFilters: [] });
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
});

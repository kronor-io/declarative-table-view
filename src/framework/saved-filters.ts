import { FilterFormState, serializeFilterFormStateArray, parseFilterFormState } from './filter-form-state';
import { FilterFieldSchema } from './filters';

/**
 * Current format revision for saved filters
 */
export const CURRENT_FORMAT_REVISION = '2025-09-04T00:00:00.000Z';

export interface SavedFilter {
    id: string;
    name: string;
    view: string;
    state: any; // Serialized FilterFormState[]
    createdAt: Date;
    formatRevision: string; // ISO date string indicating the format version
}

export interface SavedFilterManager {
    loadSavedFilters: (viewName: string) => SavedFilter[];
    saveFilter: (filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>) => SavedFilter;
    updateFilter: (filter: SavedFilter, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>) => SavedFilter | null;
    deleteFilter: (id: string) => boolean;
    parseFilterState: (savedFilter: SavedFilter, schema: FilterFieldSchema) => FilterFormState[];
    serializeFilterState: (state: FilterFormState[]) => any;
}

/**
 * Local storage key for saved filters
 */
const SAVED_FILTERS_KEY = 'savedFilters';

/**
 * Create a saved filter manager that handles localStorage operations
 */
export function createSavedFilterManager(): SavedFilterManager {

    function loadAllSavedFilters(): SavedFilter[] {
        try {
            const raw = localStorage.getItem(SAVED_FILTERS_KEY);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.map((item: any) => ({
                id: item.id || crypto.randomUUID(),
                name: item.name || 'Unnamed Filter',
                view: item.view,
                state: item.state || [],
                createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                formatRevision: item.formatRevision || CURRENT_FORMAT_REVISION
            }));
        } catch (error) {
            console.error('Failed to load saved filters from localStorage:', error);
            return [];
        }
    }

    function loadSavedFilters(viewName: string): SavedFilter[] {
        try {
            const raw = localStorage.getItem(SAVED_FILTERS_KEY);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            const filters = parsed.map((item: any) => ({
                id: item.id || crypto.randomUUID(),
                name: item.name || 'Unnamed Filter',
                view: item.view,
                state: item.state || [],
                createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                formatRevision: item.formatRevision
            }));

            return filters.filter((filter: SavedFilter) => filter.view === viewName);
        } catch (error) {
            console.error('Failed to load saved filters from localStorage:', error);
            return [];
        }
    }

    function saveFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): SavedFilter {
        const newFilter: SavedFilter = {
            id: crypto.randomUUID(),
            ...filter,
            createdAt: new Date(),
            formatRevision: CURRENT_FORMAT_REVISION
        };

        const existingFilters = loadAllSavedFilters();
        const updatedFilters = [...existingFilters, newFilter];

        try {
            localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updatedFilters));
            return newFilter;
        } catch (error) {
            console.error('Failed to save filter to localStorage:', error);
            throw new Error('Failed to save filter');
        }
    }

    function updateFilter(filter: SavedFilter, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): SavedFilter | null {
        const allFilters = loadAllSavedFilters();
        const filterIndex = allFilters.findIndex(existingFilter => existingFilter.id === filter.id);

        if (filterIndex === -1) {
            return null;
        }

        const updatedFilter: SavedFilter = {
            ...allFilters[filterIndex],
            ...updates
        };

        const updatedFilters = [...allFilters];
        updatedFilters[filterIndex] = updatedFilter;

        try {
            localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updatedFilters));
            return updatedFilter;
        } catch (error) {
            console.error('Failed to update filter in localStorage:', error);
            throw new Error('Failed to update filter');
        }
    }

    function deleteFilter(id: string): boolean {
        try {
            const raw = localStorage.getItem(SAVED_FILTERS_KEY);
            if (!raw) {
                return false;
            }

            const existingFilters = JSON.parse(raw);
            if (!Array.isArray(existingFilters)) {
                return false;
            }

            const filteredFilters = existingFilters.filter((filter: any) => filter.id !== id);

            if (filteredFilters.length === existingFilters.length) {
                return false; // Filter not found
            }

            localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filteredFilters));
            return true;
        } catch (error) {
            console.error('Failed to delete filter from localStorage:', error);
            throw new Error('Failed to delete filter');
        }
    }

    function parseFilterState(savedFilter: SavedFilter, schema: FilterFieldSchema): FilterFormState[] {
        return parseFilterFormState(savedFilter.state, schema);
    }

    function serializeFilterState(state: FilterFormState[]): any {
        return serializeFilterFormStateArray(state);
    }

    return {
        loadSavedFilters,
        saveFilter,
        updateFilter,
        deleteFilter,
        parseFilterState,
        serializeFilterState
    };
}

/**
 * Default exported instance of the saved filter manager
 */
export const savedFilterManager = createSavedFilterManager();

import { serializeFilterFormStateMap, parseFilterFormState } from './filter-form-state';
import { FilterSchemasAndGroups } from './filters';
import { FilterState } from './state';

/**
 * Format revisions for saved filters
 */
export const OLD_ARRAY_FORMAT_REVISION = '2025-09-04T00:00:00.000Z';
export const CURRENT_FORMAT_REVISION = '2025-09-19T00:00:00.000Z';

/**
 * Raw saved filter data as stored in localStorage - using unknown for type safety
 */
export interface RawSavedFilter {
    id: string;
    name: string;
    view: string;
    state: unknown; // Serialized FilterState - could be object format or legacy array format
    createdAt: string | Date; // Could be string from JSON or Date object
    formatRevision?: string; // Optional for backwards compatibility
}

/**
 * Parsed saved filter with properly typed state
 */
export interface SavedFilter {
    id: string;
    name: string;
    view: string;
    state: FilterState; // Parsed FilterState as a Map
    createdAt: Date;
    formatRevision: string;
}

/**
 * Interface for the saved filter manager
 */
export interface SavedFilterManager {
    loadFilters(viewName: string, schema: FilterSchemasAndGroups): SavedFilter[];
    saveFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): SavedFilter;
    updateFilter(filter: SavedFilter, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): SavedFilter | null;
    deleteFilter(id: string): boolean;
}

const SAVED_FILTERS_KEY = 'dtvSavedFilters';
const LEGACY_SAVED_FILTERS_KEY = 'savedFilters';

/**
 * Convert old array format to object format using schema order
 */
function convertArrayToObject(state: unknown, schema: FilterSchemasAndGroups): Record<string, unknown> {
    if (!Array.isArray(state)) {
        console.warn('Expected array for conversion but got:', typeof state);
        return {};
    }

    const objectState: Record<string, unknown> = {};

    // Map array positions to filter IDs using schema order
    state.forEach((filterState: unknown, index: number) => {
        if (index < schema.filters.length) {
            const filterId = schema.filters[index].id;
            objectState[filterId] = filterState;
        }
    });

    return objectState;
}

/**
 * Create and return a SavedFilterManager instance
 */
export function createSavedFilterManager(): SavedFilterManager {

    /**
     * Migrate data from legacy localStorage key to current key if needed
     * Returns true if migration occurred, false otherwise
     */
    function migrateLegacyStorageKey(): boolean {
        try {
            // Check if current key already has data
            if (localStorage.getItem(SAVED_FILTERS_KEY)) {
                return false; // No migration needed
            }

            // Check if legacy key has data
            const legacyRaw = localStorage.getItem(LEGACY_SAVED_FILTERS_KEY);
            if (!legacyRaw) {
                return false; // No legacy data to migrate
            }

            console.info('Found saved filters in legacy localStorage key, migrating...');

            // Move data from legacy key to current key
            localStorage.setItem(SAVED_FILTERS_KEY, legacyRaw);
            localStorage.removeItem(LEGACY_SAVED_FILTERS_KEY);

            // Parse to get count for logging
            const parsed: unknown = JSON.parse(legacyRaw);
            const count = Array.isArray(parsed) ? parsed.length : 0;
            console.info(`Migrated ${count} filters from legacy localStorage key '${LEGACY_SAVED_FILTERS_KEY}' to '${SAVED_FILTERS_KEY}'`);

            return true;
        } catch (error) {
            console.error('Failed to migrate legacy localStorage key:', error);
            return false;
        }
    }

    /**
     * Load raw saved filters from localStorage with proper type safety
     */
    function loadRawSavedFilters(): RawSavedFilter[] {
        try {
            // First, handle legacy key migration
            migrateLegacyStorageKey();

            // Now load from the current key
            const raw = localStorage.getItem(SAVED_FILTERS_KEY);
            if (!raw) {
                return [];
            }

            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.map((item: unknown) => {
                // Type guard for item structure
                if (typeof item !== 'object' || item === null) {
                    throw new Error('Invalid saved filter structure');
                }

                const rawItem = item as Record<string, unknown>;

                return {
                    id: typeof rawItem.id === 'string' ? rawItem.id : crypto.randomUUID(),
                    name: typeof rawItem.name === 'string' ? rawItem.name : 'Unnamed Filter',
                    view: typeof rawItem.view === 'string' ? rawItem.view : '',
                    state: rawItem.state, // Keep as unknown for later parsing
                    createdAt: typeof rawItem.createdAt === 'string'
                        ? rawItem.createdAt
                        : new Date().toISOString(),
                    formatRevision: typeof rawItem.formatRevision === 'string'
                        ? rawItem.formatRevision
                        : OLD_ARRAY_FORMAT_REVISION // Default to old format for items without revision
                } satisfies RawSavedFilter;
            });
        } catch (error) {
            console.error('Failed to load saved filters from localStorage:', error);
            return [];
        }
    }

    /**
     * Load and parse saved filters for a specific view
     */
    function loadFilters(viewName: string, schema: FilterSchemasAndGroups): SavedFilter[] {
        const allRawFilters = loadRawSavedFilters();
        let hasMigrations = false;

        // Process all raw filters for migration
        const updatedAllRawFilters = allRawFilters.map((rawFilter) => {
            // If this is old array format, convert to object format
            if (rawFilter.formatRevision === OLD_ARRAY_FORMAT_REVISION) {
                hasMigrations = true;
                const objectState = convertArrayToObject(rawFilter.state, schema);
                return {
                    ...rawFilter,
                    state: objectState,
                    formatRevision: CURRENT_FORMAT_REVISION
                };
            }

            // Always ensure current revision
            return {
                ...rawFilter,
                formatRevision: CURRENT_FORMAT_REVISION
            };
        });

        // Filter for the specific view from the updated filters
        const viewRawFilters = updatedAllRawFilters.filter(filter => filter.view === viewName);

        // Parse the view-specific filters into SavedFilter format
        const parsedFilters = viewRawFilters.map((rawFilter): SavedFilter => {
            // Parse the object state into a Map
            const parsedState = parseFilterFormState(rawFilter.state as Record<string, unknown>, schema);

            return {
                id: rawFilter.id,
                name: rawFilter.name,
                view: rawFilter.view,
                state: parsedState,
                createdAt: typeof rawFilter.createdAt === 'string'
                    ? new Date(rawFilter.createdAt)
                    : rawFilter.createdAt,
                formatRevision: CURRENT_FORMAT_REVISION
            };
        });

        // If we migrated anything, save all updated filters
        if (hasMigrations) {
            try {
                localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updatedAllRawFilters));
                console.info(`Migrated filters from old array format to new object format`);
            } catch (error) {
                console.error('Failed to save migrated filters to localStorage:', error);
            }
        }

        return parsedFilters;
    }

    /**
     * Save a filter to localStorage
     */
    function saveFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'formatRevision'>): SavedFilter {
        const savedFilter: SavedFilter = {
            id: crypto.randomUUID(),
            createdAt: new Date(),
            formatRevision: CURRENT_FORMAT_REVISION,
            ...filter
        };

        const existingFilters = loadRawSavedFilters();
        const newRawFilter: RawSavedFilter = {
            ...savedFilter,
            createdAt: savedFilter.createdAt.toISOString(),
            state: serializeFilterFormStateMap(savedFilter.state)
        };

        existingFilters.push(newRawFilter);
        localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(existingFilters));
        return savedFilter;
    }

    /**
     * Update an existing filter
     */
    function updateFilter(filter: SavedFilter, updates: Partial<Pick<SavedFilter, 'name' | 'state'>>): SavedFilter | null {
        const allFilters = loadRawSavedFilters();
        const filterIndex = allFilters.findIndex((existingFilter: RawSavedFilter) => existingFilter.id === filter.id);

        if (filterIndex === -1) {
            return null;
        }

        const updatedFilter: SavedFilter = {
            ...filter,
            ...updates
        };

        const updatedRawFilter: RawSavedFilter = {
            ...allFilters[filterIndex],
            name: updatedFilter.name,
            state: updates.state ? serializeFilterFormStateMap(updates.state) : allFilters[filterIndex].state
        };

        allFilters[filterIndex] = updatedRawFilter;
        localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(allFilters));
        return updatedFilter;
    }

    /**
     * Delete a filter by ID
     */
    function deleteFilter(id: string): boolean {
        const allFilters = loadRawSavedFilters();
        const originalLength = allFilters.length;
        const filteredFilters = allFilters.filter((filter: RawSavedFilter) => filter.id !== id);

        if (filteredFilters.length === originalLength) {
            return false; // Filter not found
        }

        localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filteredFilters));
        return true;
    }

    return {
        loadFilters,
        saveFilter,
        updateFilter,
        deleteFilter
    };
}

/**
 * Default exported instance of the saved filter manager
 */
export const savedFilterManager = createSavedFilterManager();

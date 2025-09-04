import { FilterFormState } from '../components/FilterForm';
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
 * Helper to serialize FilterFormState to JSON for storage
 */
function serializeNode(node: FilterFormState): any {
    if (node.type === 'leaf') {
        let value = node.value;
        if (value instanceof Date) {
            value = value.toISOString();
        }
        return { ...node, value };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: serializeNode(node.child),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: node.children.map(serializeNode),
            filterType: node.filterType
        };
    }
}

/**
 * Helper to deserialize JSON to FilterFormState with proper date handling
 */
function deserializeNodeWithDates(node: any, dateFields: Set<string>): FilterFormState {
    if (node.type === 'leaf') {
        let value = node.value;
        if (typeof value === 'string' && dateFields.has(node.field)) {
            const date = new Date(value);
            value = isNaN(date.getTime()) ? null : date;
        }
        return { ...node, value };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: deserializeNodeWithDates(node.child, dateFields),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: (node.children || []).map((child: any) => deserializeNodeWithDates(child, dateFields)),
            filterType: node.filterType
        };
    }
}

/**
 * Helper to collect all fields that are date controls from the schema
 */
function collectDateFieldsFromSchema(schema: FilterFieldSchema): Set<string> {
    const dateFields = new Set<string>();

    function traverse(expr: any) {
        if (expr.type === 'and' || expr.type === 'or') {
            expr.filters.forEach(traverse);
        } else if ('field' in expr && 'value' in expr && expr.value.type === 'date') {
            // Handle FilterField - extract all individual field names
            if (typeof expr.field === 'string') {
                dateFields.add(expr.field);
            } else if ('and' in expr.field) {
                expr.field.and.forEach((field: string) => dateFields.add(field));
            } else if ('or' in expr.field) {
                expr.field.or.forEach((field: string) => dateFields.add(field));
            }
        }
    }

    schema.filters.forEach(filter => traverse(filter.expression));
    return dateFields;
}

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
        try {
            const dateFields = collectDateFieldsFromSchema(schema);
            return savedFilter.state.map((node: any) => deserializeNodeWithDates(node, dateFields));
        } catch (error) {
            console.error('Failed to parse filter state:', error);
            return [];
        }
    }

    function serializeFilterState(state: FilterFormState[]): any {
        return state.map(node => serializeNode(node));
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

/**
 * @jest-environment jsdom
 */
import { createSavedFilterManager, SavedFilter, CURRENT_FORMAT_REVISION } from './saved-filters';
import { FilterSchemasAndGroups } from './filters';

// Mock crypto.randomUUID for consistent testing
const mockUUID = jest.fn();
Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: mockUUID },
    writable: true
});

describe('SavedFilterManager', () => {
    let manager: ReturnType<typeof createSavedFilterManager>;
    let mockLocalStorage: { [key: string]: string };

    // Basic test schema for simple tests
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

    beforeEach(() => {
        // Reset UUID counter
        let uuidCounter = 0;
        mockUUID.mockImplementation(() => `test-uuid-${++uuidCounter}`);

        // Mock localStorage
        mockLocalStorage = {};
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
                setItem: jest.fn((key: string, value: string) => {
                    mockLocalStorage[key] = value;
                }),
                removeItem: jest.fn((key: string) => {
                    delete mockLocalStorage[key];
                })
            },
            writable: true
        });

        manager = createSavedFilterManager();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('loadFilters', () => {
        it('should return empty array when no filters are saved', () => {
            const filters = manager.loadFilters('test-view', basicSchema);
            expect(filters).toEqual([]);
        });

        it('should load saved filters from localStorage', () => {
            const savedData = [
                {
                    id: 'filter-1',
                    name: 'Test Filter',
                    view: 'test-view',
                    state: { 'email-filter': { type: 'leaf', field: 'email', value: 'test@example.com', control: { type: 'text' } } },
                    createdAt: new Date().toISOString(),
                    formatRevision: CURRENT_FORMAT_REVISION
                }
            ];
            mockLocalStorage['dtvSavedFilters'] = JSON.stringify(savedData);

            const filters = manager.loadFilters('test-view', basicSchema);
            expect(filters).toHaveLength(1);
            expect(filters[0].name).toBe('Test Filter');
            expect(filters[0].state).toBeInstanceOf(Map);
        });

        it('should filter saved filters by view', () => {
            const savedData = [
                {
                    id: 'filter-1',
                    name: 'Filter for View A',
                    view: 'view-a',
                    state: {},
                    createdAt: new Date().toISOString(),
                    formatRevision: CURRENT_FORMAT_REVISION
                },
                {
                    id: 'filter-2',
                    name: 'Filter for View B',
                    view: 'view-b',
                    state: {},
                    createdAt: new Date().toISOString(),
                    formatRevision: CURRENT_FORMAT_REVISION
                }
            ];
            mockLocalStorage['dtvSavedFilters'] = JSON.stringify(savedData);

            const filtersForViewA = manager.loadFilters('view-a', basicSchema);
            expect(filtersForViewA).toHaveLength(1);
            expect(filtersForViewA[0].name).toBe('Filter for View A');
        });

        it('should handle invalid localStorage data gracefully', () => {
            // Mock console.error to suppress expected error output in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            mockLocalStorage['dtvSavedFilters'] = 'invalid json';
            const filters = manager.loadFilters('test-view', basicSchema);
            expect(filters).toEqual([]);

            // Verify error was logged and restore console
            expect(consoleSpy).toHaveBeenCalledWith('Failed to load saved filters from localStorage:', expect.any(Error));
            consoleSpy.mockRestore();
        });

        it('should handle non-array localStorage data gracefully', () => {
            // Mock console.error to suppress expected error output in tests
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            mockLocalStorage['dtvSavedFilters'] = JSON.stringify({ not: 'an array' });
            const filters = manager.loadFilters('test-view', basicSchema);
            expect(filters).toEqual([]);

            // Restore console
            consoleSpy.mockRestore();
        });

        it('should migrate old array format filters and overwrite in localStorage', () => {
            // Mock console.info to suppress expected info output in tests
            const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => { });

            // Create old format data with OLD_ARRAY_FORMAT_REVISION
            const oldFormatData = [
                {
                    id: 'old-filter',
                    name: 'Old Format Filter',
                    view: 'test-view',
                    state: [
                        {
                            type: 'leaf',
                            field: 'email',
                            value: 'old@test.com',
                            control: { type: 'text' },
                            filterType: 'equals'
                        }
                    ],
                    createdAt: new Date().toISOString(),
                    formatRevision: '2025-09-04T00:00:00.000Z' // OLD_ARRAY_FORMAT_REVISION
                }
            ];

            mockLocalStorage['dtvSavedFilters'] = JSON.stringify(oldFormatData);

            // Load filters - should trigger migration
            const filters = manager.loadFilters('test-view', basicSchema);

            expect(filters).toHaveLength(1);
            expect(filters[0].name).toBe('Old Format Filter');
            expect(filters[0].state).toBeInstanceOf(Map);
            expect(filters[0].formatRevision).toBe('2025-09-19T00:00:00.000Z'); // CURRENT_FORMAT_REVISION

            // Check that localStorage was updated with migrated data
            expect(localStorage.setItem).toHaveBeenCalledWith(
                'dtvSavedFilters',
                expect.stringContaining('"formatRevision":"2025-09-19T00:00:00.000Z"')
            );

            // Verify the migrated state is no longer an array
            const savedData = JSON.parse(mockLocalStorage['dtvSavedFilters']);
            expect(savedData[0].formatRevision).toBe('2025-09-19T00:00:00.000Z');
            expect(Array.isArray(savedData[0].state)).toBe(false); // Should be object now

            // Verify info was logged and restore console
            expect(consoleSpy).toHaveBeenCalledWith('Migrated filters from old array format to new object format');
            consoleSpy.mockRestore();
        });

        it('should migrate filters from legacy localStorage key', () => {
            // Mock console.info to suppress expected info output in tests
            const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => { });

            // Create data in legacy key
            const legacyData = [
                {
                    id: 'legacy-filter',
                    name: 'Legacy Key Filter',
                    view: 'test-view',
                    state: [
                        {
                            type: 'leaf',
                            field: 'email',
                            value: 'legacy@test.com',
                            control: { type: 'text' },
                            filterType: 'equals'
                        }
                    ],
                    createdAt: new Date().toISOString(),
                    formatRevision: '2025-09-04T00:00:00.000Z' // OLD_ARRAY_FORMAT_REVISION
                }
            ];

            // Put data only in legacy key
            mockLocalStorage['savedFilters'] = JSON.stringify(legacyData);

            // Load filters - should trigger migration from legacy key
            const filters = manager.loadFilters('test-view', basicSchema);

            expect(filters).toHaveLength(1);
            expect(filters[0].name).toBe('Legacy Key Filter');
            expect(filters[0].state).toBeInstanceOf(Map);
            expect(filters[0].formatRevision).toBe('2025-09-19T00:00:00.000Z'); // CURRENT_FORMAT_REVISION

            // Check that data was moved to new key
            expect(mockLocalStorage['dtvSavedFilters']).toBeDefined();
            expect(mockLocalStorage['savedFilters']).toBeUndefined(); // Should be removed

            // Verify the migrated data
            const savedData = JSON.parse(mockLocalStorage['dtvSavedFilters']);
            expect(savedData[0].formatRevision).toBe('2025-09-19T00:00:00.000Z');
            expect(Array.isArray(savedData[0].state)).toBe(false); // Should be object now

            // Verify info messages were logged and restore console
            expect(consoleSpy).toHaveBeenCalledWith('Found saved filters in legacy localStorage key, migrating...');
            expect(consoleSpy).toHaveBeenCalledWith("Migrated 1 filters from legacy localStorage key 'savedFilters' to 'dtvSavedFilters'");
            expect(consoleSpy).toHaveBeenCalledWith('Migrated filters from old array format to new object format');
            consoleSpy.mockRestore();
        });

        it('should handle invalid state format during array conversion gracefully', () => {
            // Mock console.warn and console.info to suppress expected output in tests
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
            const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => { });

            // Create old format data with invalid state (not an array)
            const invalidFormatData = [
                {
                    id: 'invalid-state-filter',
                    name: 'Invalid State Filter',
                    view: 'test-view',
                    state: 'not-an-array', // This should trigger console.warn
                    createdAt: new Date().toISOString(),
                    formatRevision: '2025-09-04T00:00:00.000Z' // OLD_ARRAY_FORMAT_REVISION
                }
            ];

            mockLocalStorage['dtvSavedFilters'] = JSON.stringify(invalidFormatData);

            // Load filters - should trigger warning about invalid state format
            const filters = manager.loadFilters('test-view', basicSchema);

            // Should still return the filter but with empty state Map
            expect(filters).toHaveLength(1);
            expect(filters[0].name).toBe('Invalid State Filter');
            expect(filters[0].state).toBeInstanceOf(Map);
            expect(filters[0].state.size).toBe(0);

            // Verify warning was logged and restore console
            expect(consoleWarnSpy).toHaveBeenCalledWith('Expected array for conversion but got:', 'string');
            consoleWarnSpy.mockRestore();
            consoleInfoSpy.mockRestore();
        });
    });

    describe('saveFilter', () => {
        it('should save filter to localStorage', () => {
            const filterState = new Map([
                ['email-filter', {
                    type: 'leaf' as const,
                    field: 'email',
                    value: 'test@example.com',
                    control: { type: 'text' as const },
                    filterType: 'equals' as const
                }]
            ]);

            const filterToSave = {
                name: 'Test Filter',
                view: 'test-view',
                state: filterState
            };

            const savedFilter = manager.saveFilter(filterToSave);

            expect(savedFilter.id).toBe('test-uuid-1');
            expect(savedFilter.name).toBe('Test Filter');
            expect(savedFilter.state).toBeInstanceOf(Map);
            expect(savedFilter.createdAt).toBeInstanceOf(Date);
            expect(savedFilter.formatRevision).toBe(CURRENT_FORMAT_REVISION);

            // Check localStorage was called
            expect(localStorage.setItem).toHaveBeenCalledWith(
                'dtvSavedFilters',
                expect.stringContaining('Test Filter')
            );
        });

        it('should save multiple filters', () => {
            const filterState = new Map([
                ['email-filter', {
                    type: 'leaf' as const,
                    field: 'email',
                    value: 'test@example.com',
                    control: { type: 'text' as const },
                    filterType: 'equals' as const
                }]
            ]);

            const filter1 = { name: 'Filter 1', view: 'test-view', state: filterState };
            const filter2 = { name: 'Filter 2', view: 'test-view', state: filterState };

            manager.saveFilter(filter1);
            manager.saveFilter(filter2);

            const loadedFilters = manager.loadFilters('test-view', basicSchema);
            expect(loadedFilters).toHaveLength(2);
        });
    });

    describe('updateFilter', () => {
        it('should update existing filter', () => {
            const filterState = new Map([
                ['email-filter', {
                    type: 'leaf' as const,
                    field: 'email',
                    value: 'test@example.com',
                    control: { type: 'text' as const },
                    filterType: 'equals' as const
                }]
            ]);

            const existingFilter: SavedFilter = {
                id: 'existing-id',
                name: 'Old Name',
                view: 'test-view',
                state: filterState,
                createdAt: new Date(),
                formatRevision: CURRENT_FORMAT_REVISION
            };

            // Manually add to localStorage to simulate existing filter
            mockLocalStorage['dtvSavedFilters'] = JSON.stringify([{
                id: 'existing-id',
                name: 'Old Name',
                view: 'test-view',
                state: { 'email-filter': { type: 'leaf', field: 'email', value: 'test@example.com', control: { type: 'text' } } },
                createdAt: new Date().toISOString(),
                formatRevision: CURRENT_FORMAT_REVISION
            }]);

            const updates = { name: 'Updated Name' };
            const updatedFilter = manager.updateFilter(existingFilter, updates);

            expect(updatedFilter).not.toBeNull();
            expect(updatedFilter!.name).toBe('Updated Name');
            expect(updatedFilter!.id).toBe('existing-id');
        });

        it('should return null for non-existent filter', () => {
            const filterState = new Map([
                ['email-filter', {
                    type: 'leaf' as const,
                    field: 'email',
                    value: 'test@example.com',
                    control: { type: 'text' as const },
                    filterType: 'equals' as const
                }]
            ]);

            const nonExistentFilter: SavedFilter = {
                id: 'non-existent',
                name: 'Non-existent',
                view: 'test-view',
                state: filterState,
                createdAt: new Date(),
                formatRevision: CURRENT_FORMAT_REVISION
            };

            const result = manager.updateFilter(nonExistentFilter, { name: 'New Name' });
            expect(result).toBeNull();
        });
    });

    describe('deleteFilter', () => {
        it('should delete existing filter', () => {
            const savedData = [
                {
                    id: 'filter-to-delete',
                    name: 'Filter to Delete',
                    view: 'test-view',
                    state: {},
                    createdAt: new Date().toISOString(),
                    formatRevision: CURRENT_FORMAT_REVISION
                }
            ];
            mockLocalStorage['dtvSavedFilters'] = JSON.stringify(savedData);

            const result = manager.deleteFilter('filter-to-delete');
            expect(result).toBe(true);

            // Verify the filter was removed
            const remainingFilters = manager.loadFilters('test-view', basicSchema);
            expect(remainingFilters).toHaveLength(0);
        });

        it('should return false for non-existent filter', () => {
            const result = manager.deleteFilter('non-existent-id');
            expect(result).toBe(false);
        });
    });
});

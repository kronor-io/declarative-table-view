/**
 * @jest-environment jsdom
 */
import { createSavedFilterManager, SavedFilter, CURRENT_FORMAT_REVISION } from './saved-filters';
import { FilterFieldSchema } from './filters';
import { FilterFormState } from '../components/FilterForm';

// Mock crypto.randomUUID for consistent testing
const mockUUID = jest.fn();
Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: mockUUID },
    writable: true
});

describe('SavedFilterManager', () => {
    let manager: ReturnType<typeof createSavedFilterManager>;
    let mockLocalStorage: { [key: string]: string };

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
                }),
                clear: jest.fn(() => {
                    mockLocalStorage = {};
                })
            },
            writable: true
        });

        manager = createSavedFilterManager();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('loadSavedFilters', () => {
        it('should return empty array when no filters are saved', () => {
            const filters = manager.loadSavedFilters('test-view');
            expect(filters).toEqual([]);
        });

        it('should load saved filters from localStorage', () => {
            const savedData = [
                {
                    id: 'filter-1',
                    name: 'Test Filter',
                    view: 'test-view',
                    state: [],
                    createdAt: '2023-01-01T00:00:00.000Z'
                }
            ];
            mockLocalStorage['savedFilters'] = JSON.stringify(savedData);

            const filters = manager.loadSavedFilters('test-view');
            expect(filters).toHaveLength(1);
            expect(filters[0].id).toBe('filter-1');
            expect(filters[0].name).toBe('Test Filter');
            expect(filters[0].view).toBe('test-view');
        });

        it('should filter by view name when provided', () => {
            const savedData = [
                {
                    id: 'filter-1',
                    name: 'Filter for View A',
                    view: 'view-a',
                    state: [],
                    createdAt: '2023-01-01T00:00:00.000Z'
                },
                {
                    id: 'filter-2',
                    name: 'Filter for View B',
                    view: 'view-b',
                    state: [],
                    createdAt: '2023-01-01T00:00:00.000Z'
                }
            ];
            mockLocalStorage['savedFilters'] = JSON.stringify(savedData);

            const filtersForViewA = manager.loadSavedFilters('view-a');
            expect(filtersForViewA).toHaveLength(1);
            expect(filtersForViewA[0].name).toBe('Filter for View A');
        });

        it('should handle corrupted localStorage data gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            mockLocalStorage['savedFilters'] = 'invalid json';

            const filters = manager.loadSavedFilters('test-view');
            expect(filters).toEqual([]);

            expect(consoleSpy).toHaveBeenCalledWith(
                'Failed to load saved filters from localStorage:',
                expect.any(SyntaxError)
            );
            consoleSpy.mockRestore();
        }); it('should add missing properties to loaded filters', () => {
            const incompleteData = [
                {
                    name: 'Incomplete Filter',
                    view: 'test-view'
                }
            ];
            mockLocalStorage['savedFilters'] = JSON.stringify(incompleteData);

            const filters = manager.loadSavedFilters('test-view');
            expect(filters).toHaveLength(1);
            expect(filters[0].id).toBe('test-uuid-1');
            expect(filters[0].state).toEqual([]);
            expect(filters[0].createdAt).toBeInstanceOf(Date);
        });
    });

    describe('saveFilter', () => {
        it('should save a new filter to localStorage', () => {
            const filterToSave = {
                name: 'New Filter',
                view: 'test-view',
                state: []
            };

            const savedFilter = manager.saveFilter(filterToSave);

            expect(savedFilter.id).toBe('test-uuid-1');
            expect(savedFilter.name).toBe('New Filter');
            expect(savedFilter.view).toBe('test-view');
            expect(savedFilter.createdAt).toBeInstanceOf(Date);

            // Verify it was saved to localStorage
            const savedData = JSON.parse(mockLocalStorage['savedFilters']);
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('test-uuid-1');
        });

        it('should append to existing filters', () => {
            // Add an existing filter
            const existingFilter = {
                id: 'existing-1',
                name: 'Existing Filter',
                view: 'test-view',
                state: [],
                createdAt: new Date().toISOString()
            };
            mockLocalStorage['savedFilters'] = JSON.stringify([existingFilter]);

            const newFilter = {
                name: 'New Filter',
                view: 'test-view',
                state: []
            };

            manager.saveFilter(newFilter);

            const savedData = JSON.parse(mockLocalStorage['savedFilters']);
            expect(savedData).toHaveLength(2);
            expect(savedData[0].id).toBe('existing-1');
            expect(savedData[1].id).toBe('test-uuid-1');
        });
    });

    describe('updateFilter', () => {
        beforeEach(() => {
            const existingFilters = [
                {
                    id: 'filter-1',
                    name: 'Original Name',
                    view: 'test-view',
                    state: [],
                    createdAt: '2023-01-01T00:00:00.000Z'
                }
            ];
            mockLocalStorage['savedFilters'] = JSON.stringify(existingFilters);
        });

        it('should update an existing filter', () => {
            const updates = {
                name: 'Updated Name',
                state: [{ type: 'leaf', field: 'test', value: 'updated' }]
            };

            const existingFilter = {
                id: 'filter-1',
                name: 'Original Name',
                view: 'test-view',
                state: [],
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                formatRevision: CURRENT_FORMAT_REVISION
            };

            const updatedFilter = manager.updateFilter(existingFilter, updates);

            expect(updatedFilter).not.toBeNull();
            expect(updatedFilter!.name).toBe('Updated Name');
            expect(updatedFilter!.state).toEqual(updates.state);

            // Verify it was updated in localStorage
            const savedData = JSON.parse(mockLocalStorage['savedFilters']);
            expect(savedData[0].name).toBe('Updated Name');
        });

        it('should return null for non-existent filter', () => {
            const nonExistentFilter = {
                id: 'non-existent',
                name: 'Non Existent',
                view: 'test-view',
                state: [],
                createdAt: new Date(),
                formatRevision: CURRENT_FORMAT_REVISION
            };
            const result = manager.updateFilter(nonExistentFilter, { name: 'New Name' });
            expect(result).toBeNull();
        });
    });

    describe('deleteFilter', () => {
        beforeEach(() => {
            const existingFilters = [
                {
                    id: 'filter-1',
                    name: 'Filter 1',
                    view: 'test-view',
                    state: [],
                    createdAt: '2023-01-01T00:00:00.000Z'
                },
                {
                    id: 'filter-2',
                    name: 'Filter 2',
                    view: 'test-view',
                    state: [],
                    createdAt: '2023-01-01T00:00:00.000Z'
                }
            ];
            mockLocalStorage['savedFilters'] = JSON.stringify(existingFilters);
        });

        it('should delete an existing filter', () => {
            const result = manager.deleteFilter('filter-1');

            expect(result).toBe(true);

            // Verify it was removed from localStorage
            const savedData = JSON.parse(mockLocalStorage['savedFilters']);
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('filter-2');
        });

        it('should return false for non-existent filter', () => {
            const result = manager.deleteFilter('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('parseFilterState', () => {
        const testSchema: FilterFieldSchema = {
            groups: [{ name: 'default', label: null }],
            filters: [
                {
                    id: 'date-filter',
                    label: 'Date Filter',
                    expression: {
                        type: 'equals',
                        field: 'dateField',
                        value: { type: 'date' }
                    },
                    group: 'default',
                    aiGenerated: false
                },
                {
                    id: 'text-filter',
                    label: 'Text Filter',
                    expression: {
                        type: 'equals',
                        field: 'textField',
                        value: { type: 'text' }
                    },
                    group: 'default',
                    aiGenerated: false
                }
            ]
        };

        it('should parse filter state with date conversion', () => {
            const savedFilter: SavedFilter = {
                id: 'test',
                name: 'Test',
                view: 'test',
                state: [
                    {
                        type: 'leaf',
                        field: 'dateField',
                        value: '2023-01-01T00:00:00.000Z',
                        control: { type: 'date' },
                        filterType: 'equals'
                    },
                    {
                        type: 'leaf',
                        field: 'textField',
                        value: 'text value',
                        control: { type: 'text' },
                        filterType: 'equals'
                    }
                ],
                createdAt: new Date(),
                formatRevision: CURRENT_FORMAT_REVISION
            };

            const parsed = manager.parseFilterState(savedFilter, testSchema);

            expect(parsed).toHaveLength(2);
            expect(parsed[0].type).toBe('leaf');
            if (parsed[0].type === 'leaf') {
                expect(parsed[0].value).toBeInstanceOf(Date);
            }
            if (parsed[1].type === 'leaf') {
                expect(parsed[1].value).toBe('text value');
            }
        });

        it('should handle nested filter structures', () => {
            const savedFilter: SavedFilter = {
                id: 'test',
                name: 'Test',
                view: 'test',
                state: [
                    {
                        type: 'and',
                        children: [
                            {
                                type: 'leaf',
                                field: 'textField',
                                value: 'test',
                                control: { type: 'text' },
                                filterType: 'equals'
                            }
                        ],
                        filterType: 'and'
                    }
                ],
                createdAt: new Date(),
                formatRevision: CURRENT_FORMAT_REVISION
            };

            const parsed = manager.parseFilterState(savedFilter, testSchema);

            expect(parsed).toHaveLength(1);
            expect(parsed[0].type).toBe('and');
            expect((parsed[0] as any).children).toHaveLength(1);
        });
    });

    describe('serializeFilterState', () => {
        it('should serialize filter state with date conversion', () => {
            const state: FilterFormState[] = [
                {
                    type: 'leaf',
                    field: 'dateField',
                    value: new Date('2023-01-01T00:00:00.000Z'),
                    control: { type: 'date' },
                    filterType: 'equals'
                },
                {
                    type: 'leaf',
                    field: 'textField',
                    value: 'text value',
                    control: { type: 'text' },
                    filterType: 'equals'
                }
            ];

            const serialized = manager.serializeFilterState(state);

            expect(serialized).toHaveLength(2);
            expect(serialized[0].value).toBe('2023-01-01T00:00:00.000Z');
            expect(serialized[1].value).toBe('text value');
        });

        it('should handle nested structures', () => {
            const state: FilterFormState[] = [
                {
                    type: 'and',
                    children: [
                        {
                            type: 'leaf',
                            field: 'field1',
                            value: 'value1',
                            control: { type: 'text' },
                            filterType: 'equals'
                        }
                    ],
                    filterType: 'and'
                }
            ];

            const serialized = manager.serializeFilterState(state);

            expect(serialized).toHaveLength(1);
            expect(serialized[0].type).toBe('and');
            expect(serialized[0].children).toHaveLength(1);
            expect(serialized[0].children[0].value).toBe('value1');
        });
    });
});

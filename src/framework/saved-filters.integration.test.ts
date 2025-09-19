/**
 * @jest-environment jsdom
 */
import { createSavedFilterManager } from './saved-filters';
import { FilterFieldSchema } from './filters';

// Integration test to ensure the saved filters work end-to-end
describe('Saved Filters Integration', () => {
    let mockLocalStorage: { [key: string]: string };

    beforeEach(() => {
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

        // Mock crypto.randomUUID
        Object.defineProperty(globalThis, 'crypto', {
            value: {
                randomUUID: () => 'test-uuid-123'
            },
            writable: true
        });
    });

    it('should handle complete save and load cycle', () => {
        const manager = createSavedFilterManager();

        const testSchema: FilterFieldSchema = {
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

        // Create filter state
        const filterState = [
            {
                type: 'leaf' as const,
                field: 'email',
                value: 'test@example.com',
                control: { type: 'text' as const },
                filterType: 'equals' as const
            }
        ];

        // Save the filter
        const serializedState = manager.serializeFilterState(filterState);
        const savedFilter = manager.saveFilter({
            name: 'Test Email Filter',
            view: 'test-view',
            state: serializedState
        });

        expect(savedFilter.id).toBe('test-uuid-123');
        expect(savedFilter.name).toBe('Test Email Filter');
        expect(savedFilter.view).toBe('test-view');

        // Load the filters
        const loadedFilters = manager.loadSavedFilters('test-view');
        expect(loadedFilters).toHaveLength(1);
        expect(loadedFilters[0].name).toBe('Test Email Filter');

        // Parse the filter state back
        const parsedState = manager.parseFilterState(loadedFilters[0], testSchema);
        expect(parsedState).toHaveLength(1);
        expect(parsedState[0].type).toBe('leaf');

        if (parsedState[0].type === 'leaf') {
            expect(parsedState[0].field).toBe('email');
            expect(parsedState[0].value).toBe('test@example.com');
        }
    });

    it('should handle date serialization correctly', () => {
        const manager = createSavedFilterManager();

        const testSchema: FilterFieldSchema = {
            groups: [{ name: 'default', label: null }],
            filters: [
                {
                    id: 'date-filter',
                    label: 'Date Filter',
                    expression: {
                        type: 'equals',
                        field: 'createdAt',
                        value: { type: 'date' }
                    },
                    group: 'default',
                    aiGenerated: false
                }
            ]
        };

        const testDate = new Date('2023-01-01T00:00:00.000Z');
        const filterState = [
            {
                type: 'leaf' as const,
                field: 'createdAt',
                value: testDate,
                control: { type: 'date' as const },
                filterType: 'equals' as const
            }
        ];

        // Serialize and save
        const serializedState = manager.serializeFilterState(filterState);
        manager.saveFilter({
            name: 'Date Filter',
            view: 'test-view',
            state: serializedState
        });

        // Load and parse back
        const loadedFilters = manager.loadSavedFilters('test-view');
        const parsedState = manager.parseFilterState(loadedFilters[0], testSchema);

        expect(parsedState[0].type).toBe('leaf');
        if (parsedState[0].type === 'leaf') {
            expect(parsedState[0].value).toBeInstanceOf(Date);
            expect(parsedState[0].value.getTime()).toBe(testDate.getTime());
        }
    });
});

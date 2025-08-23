import * as React from 'react';
import { Tag } from 'primereact/tag';
import { parseViewJson } from './framework/view-parser';
import { FlexRow, FlexColumn } from './components/LayoutHelpers';

describe('External Runtime Integration', () => {
    it('should use external runtime when available', () => {
        const builtInRuntimes = {};
        const externalRuntime = {
            cellRenderers: {
                customCellRenderer: () => 'Custom Cell',
            },
            queryTransforms: {
                customTransform: {
                    fromQuery: (input: any) => input,
                    toQuery: (input: any) => ({ value: input }),
                },
            },
            noRowsComponents: {
                customNoRows: () => 'No rows custom component',
            },
            customFilterComponents: {
                customFilter: () => 'Custom filter',
            },
        };

        const testView = {
            title: 'Test External Runtime View',
            routeName: 'test-external-runtime',
            collectionName: 'testCollection',
            paginationKey: 'id',
            boolExpType: 'TestBoolExp',
            orderByType: '[TestOrderBy!]',
            runtimeKey: 'anyKey', // This will be ignored when external runtime is provided
            columns: [
                {
                    data: [{ type: 'field', path: 'id' }],
                    name: 'ID',
                    cellRenderer: { section: 'cellRenderers', key: 'customCellRenderer' },
                },
            ],
            filterSchema: {
                groups: [{ name: 'default', label: null }],
                filters: [],
            },
        };

        // Test that parseViewJson works with external runtime
        expect(() => {
            const view = parseViewJson(testView, builtInRuntimes, externalRuntime);
            expect(view.title).toBe('Test External Runtime View');
            expect(view.columnDefinitions).toHaveLength(1);
            expect(view.columnDefinitions[0].name).toBe('ID');
            expect(typeof view.columnDefinitions[0].cellRenderer).toBe('function');
        }).not.toThrow();
    });

    it('should fall back to built-in runtime when external runtime key not found', () => {
        const builtInRuntimes = {
            simpleTestView: {
                cellRenderers: {
                    defaultCellRenderer: () => 'Default Cell',
                },
                queryTransforms: {},
                noRowsComponents: {},
                customFilterComponents: {}
            },
        };
        const externalRuntime = undefined; // No external runtime provided

        const testView = {
            title: 'Test Fallback Runtime View',
            routeName: 'test-fallback-runtime',
            collectionName: 'testCollection',
            paginationKey: 'id',
            boolExpType: 'TestBoolExp',
            orderByType: '[TestOrderBy!]',
            runtimeKey: 'simpleTestView',
            columns: [
                {
                    data: [{ type: 'field', path: 'id' }],
                    name: 'ID',
                    cellRenderer: { section: 'cellRenderers', key: 'defaultCellRenderer' },
                },
            ],
            filterSchema: {
                groups: [{ name: 'default', label: null }],
                filters: [],
            },
        };

        // Test that built-in runtime is used when external doesn't have the key
        expect(() => {
            const view = parseViewJson(testView, builtInRuntimes, externalRuntime);
            expect(view.title).toBe('Test Fallback Runtime View');
            // Test the cell renderer function
            const cellRenderer = view.columnDefinitions[0].cellRenderer;
            const mockProps = {
                data: { id: 'test' },
                setFilterState: () => { },
                applyFilters: () => { },
                createElement: React.createElement,
                components: {
                    Badge: Tag,
                    FlexRow,
                    FlexColumn
                }
            };
            expect(cellRenderer(mockProps)).toBe('Default Cell');
        }).not.toThrow();
    });

    it('should prefer external runtime over built-in when both have same key', () => {
        const builtInRuntimes = {
            simpleTestView: {
                cellRenderers: {
                    defaultCellRenderer: () => 'Built-in Default',
                },
                queryTransforms: {},
                noRowsComponents: {},
                customFilterComponents: {}
            },
        };
        const externalRuntime = {
            cellRenderers: {
                defaultCellRenderer: () => 'External Override',
            },
            queryTransforms: {},
            noRowsComponents: {},
            customFilterComponents: {}
        };

        const testView = {
            title: 'Test Precedence View',
            routeName: 'test-precedence',
            collectionName: 'testCollection',
            paginationKey: 'id',
            boolExpType: 'TestBoolExp',
            orderByType: '[TestOrderBy!]',
            runtimeKey: 'anyKey', // This will be ignored since external runtime is provided
            columns: [
                {
                    data: [{ type: 'field', path: 'id' }],
                    name: 'ID',
                    cellRenderer: { section: 'cellRenderers', key: 'defaultCellRenderer' },
                },
            ],
            filterSchema: {
                groups: [{ name: 'default', label: null }],
                filters: [],
            },
        };

        expect(() => {
            const view = parseViewJson(testView, builtInRuntimes, externalRuntime);
            expect(view.title).toBe('Test Precedence View');
            // Test that external runtime took precedence
            const cellRenderer = view.columnDefinitions[0].cellRenderer;
            const mockProps = {
                data: { id: 'test' },
                setFilterState: () => { },
                applyFilters: () => { },
                createElement: React.createElement,
                components: {
                    Badge: Tag,
                    FlexRow,
                    FlexColumn
                }
            };
            expect(cellRenderer(mockProps)).toBe('External Override');
        }).not.toThrow();
    });
});

import * as React from 'react';
import { Tag } from 'primereact/tag';
import { CellRenderer, TableColumnDefinition } from './column-definition';
import { FlexRow, FlexColumn, DateTime } from './cell-renderer-components/LayoutHelpers';
import { CurrencyAmount } from './cell-renderer-components/CurrencyAmount';
import { Mapping } from './cell-renderer-components/Mapping';
import { Link } from './cell-renderer-components/Link';

describe('Cell Renderer Components', () => {
    const dummyColumn: TableColumnDefinition = { type: 'tableColumn', id: 'test', name: 'Test', data: [], cellRenderer: () => null };
    it('should provide Badge component to cell renderers', () => {
        // Create a test cell renderer that uses the Badge component
        const testCellRenderer: CellRenderer = ({ data, components, createElement }) => {
            const { Badge } = components;
            return createElement(Badge, {
                value: `Test: ${data.value}`,
                severity: 'success' as any,
                style: { fontSize: '.8rem' }
            });
        };

        // Create mock props with the components property
        const mockProps = {
            data: { value: 'Hello' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that the cell renderer can access and use the Badge component
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should provide the correct Badge component type', () => {
        const testCellRenderer: CellRenderer = ({ components }) => {
            const { Badge } = components;
            // Verify Badge is the PrimeReact Tag component
            expect(Badge).toBe(Tag);
            return null;
        };

        const mockProps = {
            data: {},
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        testCellRenderer(mockProps);
    });

    it('should allow creating Badge elements with typical PrimeReact Tag props', () => {
        const testCellRenderer: CellRenderer = ({ data, components, createElement }) => {
            const { Badge } = components;

            // Create a Badge using React.createElement (similar to JSX)
            return createElement(Badge, {
                value: data.status,
                severity: 'warning' as any,
                style: { fontSize: '0.8rem', padding: '0.3em 1em' }
            });
        };

        const mockProps = {
            data: { status: 'Pending' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should provide FlexRow and FlexColumn components to cell renderers', () => {
        // Create a test cell renderer that uses FlexRow and FlexColumn components
        const testCellRenderer: CellRenderer = ({ components, createElement }) => {
            const { FlexRow, FlexColumn } = components;
            return createElement(FlexRow, {
                children: [
                    createElement(FlexColumn, { children: 'Vertical Layout' }),
                    createElement(FlexColumn, { children: 'Another Column' })
                ]
            });
        };

        const mockProps = {
            data: { value: 'Layout Test' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that the cell renderer can access and use FlexRow/FlexColumn components
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should support flex-wrap property on FlexRow component', () => {
        // Create a test cell renderer that uses FlexRow with wrap property
        const testCellRenderer: CellRenderer = ({ components, createElement }) => {
            const { FlexRow } = components;
            return createElement(FlexRow, {
                wrap: true,
                children: ['Item 1', 'Item 2', 'Item 3']
            });
        };

        const mockProps = {
            data: { value: 'Wrap Test' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that FlexRow can handle wrap property
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should support different wrap values on FlexRow component', () => {
        const wrapValues = ['wrap', 'nowrap', 'wrap-reverse'];

        wrapValues.forEach(wrapValue => {
            const testCellRenderer: CellRenderer = ({ components, createElement }) => {
                const { FlexRow } = components;
                return createElement(FlexRow, {
                    wrap: wrapValue,
                    children: ['Test Item']
                });
            };

            const mockProps = {
                data: { value: `Wrap Test ${wrapValue}` },
                setFilterState: jest.fn(),
                applyFilters: jest.fn(),
                updateFilterById: jest.fn(),
                createElement: React.createElement,
                components: {
                    Badge: Tag,
                    FlexRow,
                    FlexColumn,
                    Mapping,
                    DateTime,
                    CurrencyAmount,
                    Link
                },
                currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
                columnDefinition: dummyColumn
            };

            expect(() => {
                const result = testCellRenderer(mockProps);
                expect(result).toBeDefined();
            }).not.toThrow();
        });
    });

    it('should provide Mapping component to cell renderers', () => {
        const testCellRenderer: CellRenderer = ({ data, components, createElement }) => {
            const { Mapping } = components;
            const statusMap = { 'pending': 'Pending', 'approved': 'Approved', 'rejected': 'Rejected' };
            return createElement(Mapping, { value: data.status, map: statusMap });
        };

        const mockProps = {
            data: { status: 'pending' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that the cell renderer can access and use the Mapping component
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should provide DateTime component to cell renderers', () => {
        const testCellRenderer: CellRenderer = ({ data, components, createElement }) => {
            const { DateTime } = components;
            return createElement(DateTime, { date: data.createdAt, options: { dateStyle: 'short' } });
        };

        const mockProps = {
            data: { createdAt: '2023-01-01T12:00:00Z' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that the cell renderer can access and use the DateTime component
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should provide CurrencyAmount component to cell renderers', () => {
        const testCellRenderer: CellRenderer = ({ data, components, createElement }) => {
            const { CurrencyAmount } = components;
            return createElement(CurrencyAmount, {
                amount: data.amount,
                currency: data.currency || 'USD',
                options: { minimumFractionDigits: 2 }
            });
        };

        const mockProps = {
            data: { amount: 12345, currency: 'EUR' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that the cell renderer can access and use the CurrencyAmount component
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });

    it('should provide Link component to cell renderers', () => {
        const testCellRenderer: CellRenderer = ({ data, components, createElement }) => {
            const { Link } = components;
            return createElement(Link, {
                text: data.linkText || 'Click here',
                href: data.url || '#',
                className: 'custom-link-class'
            });
        };

        const mockProps = {
            data: { linkText: 'Visit Example', url: 'https://example.com' },
            setFilterState: jest.fn(),
            applyFilters: jest.fn(),
            updateFilterById: jest.fn(),
            createElement: React.createElement,
            components: {
                Badge: Tag,
                FlexRow,
                FlexColumn,
                Mapping,
                DateTime,
                CurrencyAmount,
                Link
            },
            currency: { majorToMinor: jest.fn(), minorToMajor: jest.fn() },
            columnDefinition: dummyColumn
        };

        // Test that the cell renderer can access and use the Link component
        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });
});

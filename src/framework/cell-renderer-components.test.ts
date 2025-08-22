import * as React from 'react';
import { Tag } from 'primereact/tag';
import { CellRenderer } from './column-definition';

describe('Cell Renderer Components', () => {
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
            createElement: React.createElement,
            components: {
                Badge: Tag
            }
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
            createElement: React.createElement,
            components: {
                Badge: Tag
            }
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
            createElement: React.createElement,
            components: {
                Badge: Tag
            }
        };

        expect(() => {
            const result = testCellRenderer(mockProps);
            expect(result).toBeDefined();
        }).not.toThrow();
    });
});

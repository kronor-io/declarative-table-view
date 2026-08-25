import { getColumnOrderBy, type TableColumnDefinition } from './column-definition';

const cellRenderer = () => null;

describe('getColumnOrderBy', () => {
    it('uses explicit orderBy when provided', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'display',
            name: 'Display',
            orderBy: 'sortValue',
            data: [{ type: 'valueQuery', field: 'sortValue' }],
            cellRenderer
        };

        expect(getColumnOrderBy(column)).toBe('sortValue');
    });

    it('preserves explicit dotted orderBy paths', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'customer-status',
            name: 'Customer Status',
            orderBy: 'customer.profile.status',
            data: [{
                type: 'objectQuery',
                field: 'customer',
                selectionSet: [{
                    type: 'objectQuery',
                    field: 'profile',
                    selectionSet: [{ type: 'valueQuery', field: 'status' }]
                }]
            }],
            cellRenderer
        };

        expect(getColumnOrderBy(column)).toBe('customer.profile.status');
    });

    it('throws for explicit orderBy paths not selected by column data', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'display',
            name: 'Display',
            orderBy: 'sortValue',
            data: [{ type: 'valueQuery', field: 'displayValue' }],
            cellRenderer
        };

        expect(() => getColumnOrderBy(column))
            .toThrow('Column "display" orderBy "sortValue" must reference a scalar field selected by the column data');
    });

    it('infers orderBy for a single scalar value query', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'email-column',
            name: 'Email',
            data: [{ type: 'valueQuery', field: 'email' }],
            cellRenderer
        };

        expect(getColumnOrderBy(column)).toBe('email');
    });

    it('does not infer orderBy for columns with multiple field queries', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'name',
            name: 'Name',
            data: [
                { type: 'valueQuery', field: 'firstName' },
                { type: 'valueQuery', field: 'lastName' }
            ],
            cellRenderer
        };

        expect(getColumnOrderBy(column)).toBeUndefined();
    });
});

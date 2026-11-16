import type { TableColumnDefinition } from './column-definition';
import * as Orderable from './orderable';

const cellRenderer = () => null;

describe('Orderable.getColumnOrderBy', () => {
    it('uses explicit orderBy when provided', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'display',
            name: 'Display',
            orderBy: 'sortValue',
            data: [{ type: 'valueQuery', field: 'sortValue' }],
            cellRenderer
        };

        expect(Orderable.getColumnOrderBy(column)).toBe('sortValue');
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

        expect(Orderable.getColumnOrderBy(column)).toBe('customer.profile.status');
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

        expect(() => Orderable.getColumnOrderBy(column))
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

        expect(Orderable.getColumnOrderBy(column)).toBe('email');
    });

    it('does not order a single scalar value query by its field with notOrderable', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'roles',
            name: 'Roles',
            orderBy: Orderable.notOrderable,
            data: [{ type: 'valueQuery', field: 'roles' }],
            cellRenderer
        };

        expect(Orderable.getColumnOrderBy(column)).toBeUndefined();
    });

    it('recognises notOrderable by its tag, as a copy that went through JSON', () => {
        const column: TableColumnDefinition = {
            type: 'tableColumn',
            id: 'roles',
            name: 'Roles',
            orderBy: JSON.parse(JSON.stringify(Orderable.notOrderable)),
            data: [{ type: 'valueQuery', field: 'roles' }],
            cellRenderer
        };

        expect(Orderable.getColumnOrderBy(column)).toBeUndefined();
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

        expect(Orderable.getColumnOrderBy(column)).toBeUndefined();
    });
});

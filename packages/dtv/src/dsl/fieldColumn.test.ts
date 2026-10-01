import { describe, it, expect } from '@jest/globals';
import { fieldColumn, rowType, valueQuery, type FieldCellRendererProps } from './columns';
import type { CellRendererProps } from '../framework/column-definition';

type Account = { accountNr: string; accountName: string | null };
type Row = {
    posted: boolean;
    customer: { account: Account } | null;
    lines: Array<{ sku: string }> | null;
};
const RowType = rowType<Row>();

const render = (column: { cellRenderer: (props: CellRendererProps) => unknown }, data: Record<string, unknown>) =>
    column.cellRenderer({ data } as CellRendererProps);

describe('dsl/fieldColumn', () => {
    it('selects a scalar field and hands the renderer its value', () => {
        const column = fieldColumn({
            rowType: RowType,
            field: 'posted',
            name: 'Posted',
            cellRenderer: ({ value }) => (value ? 'yes' : 'no'),
        });

        expect(column.id).toBe('posted');
        expect(column.data).toEqual([valueQuery({ field: 'posted' })]);
        expect(render(column, { posted: true })).toBe('yes');
    });

    it('nests the selection along a dotted path and reads null through a missing object', () => {
        const column = fieldColumn({
            rowType: RowType,
            field: 'customer.account',
            id: 'customerAccount',
            name: 'Customer account',
            orderBy: 'customer.account.accountNr',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: ({ value }: FieldCellRendererProps<Account | null>) => value?.accountNr ?? '-',
        });

        expect(column.id).toBe('customerAccount');
        expect(column.data).toEqual([{
            type: 'objectQuery',
            field: 'customer',
            selectionSet: [{
                type: 'objectQuery',
                field: 'account',
                selectionSet: [valueQuery({ field: 'accountNr' })],
            }],
        }]);
        expect(render(column, { customer: { account: { accountNr: '1930' } } })).toBe('1930');
        expect(render(column, { customer: null })).toBe('-');
    });

    it('selects a list with its arguments', () => {
        const column = fieldColumn({
            rowType: RowType,
            field: 'lines',
            name: 'SKUs',
            select: { list: [valueQuery({ field: 'sku' })], limit: 3 },
            cellRenderer: ({ value }) => (value ?? []).map(line => line.sku).join(', '),
        });

        expect(column.data).toEqual([{
            type: 'arrayQuery',
            field: 'lines',
            selectionSet: [valueQuery({ field: 'sku' })],
            limit: 3,
        }]);
        expect(render(column, { lines: [{ sku: 'a' }, { sku: 'b' }] })).toBe('a, b');
    });

    it('rejects an orderBy the column does not select, as column() does', () => {
        expect(() => fieldColumn({
            rowType: RowType,
            field: 'customer.account',
            name: 'Customer account',
            orderBy: 'customer.account.accountName',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: () => null,
        })).toThrow('orderBy "customer.account.accountName" must reference a scalar field selected by the column data');
    });
});

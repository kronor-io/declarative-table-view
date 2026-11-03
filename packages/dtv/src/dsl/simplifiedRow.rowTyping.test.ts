import { describe, it, expect } from '@jest/globals';
import { view } from './view';
import type { View, SimplifiedRow } from './view';
import { filterGroup } from './filters';
import { fieldAlias, type ColumnDefinition } from '../framework/column-definition';
import { column, fieldColumn, virtualColumn, rowType, valueQuery, objectQuery } from './columns';

// Type-level regression tests for the row a view hands out (SimplifiedRow).
// These tests don't assert at runtime; they fail if TypeScript can't typecheck.

type InvoiceRow = {
    id: string;
    total: number | null;
    memo: string | null;
    notQueried: string;
    status: { id: number; name: string | null; color: string | null } | null;
    customer: { account: { accountNr: string; accountName: string | null } } | null;
};

const Row = rowType<InvoiceRow>();

const base = {
    title: 'Invoices',
    id: 'invoices',
    source: { type: 'collection' as const, collectionName: 'invoices' },
    paginationKey: 'id',
    boolExpType: 'InvoiceBoolExp',
    orderByType: '[InvoiceOrderBy!]',
    filterGroups: [filterGroup({ name: 'default', label: null, filters: [] })],
};

const invoiceView = view({
    ...base,
    columnDefinitions: [
        column({ rowType: Row, id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
        column({
            rowType: Row,
            id: 'status',
            name: 'Status',
            data: [objectQuery({ field: 'status', selectionSet: [valueQuery({ field: 'name' })] })],
            cellRenderer: () => null,
        }),
        column({
            rowType: Row,
            id: 'statusColor',
            name: 'Status color',
            data: [objectQuery({ field: 'status', selectionSet: [valueQuery({ field: 'color' })] })],
            cellRenderer: () => null,
        }),
        column({
            rowType: Row,
            id: 'amount',
            name: 'Amount',
            data: [fieldAlias('amount', valueQuery({ field: 'total' }))],
            cellRenderer: () => null,
        }),
        virtualColumn({ rowType: Row, id: 'memo', data: [valueQuery({ field: 'memo' })] }),
        fieldColumn({
            rowType: Row,
            field: 'customer.account',
            name: 'Account',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: ({ value }: { value: { accountNr: string } | null }) => value?.accountNr ?? null,
        }),
    ],
});

describe('dsl/view SimplifiedRow', () => {
    it('merges the data of every column', () => {
        type Selected = SimplifiedRow<typeof invoiceView>;
        const check = (row: Selected) => {
            const id: string = row.id;
            const amount: number | null = row.amount;
            // Two columns select different fields of the same object; the row has both.
            const name: string | null | undefined = row.status?.name;
            const color: string | null | undefined = row.status?.color;
            const memo: string | null = row.memo;
            // A fieldColumn: its value as the renderer takes it, under the (nullable) objects on its path.
            const accountNr: string | undefined = row.customer?.account?.accountNr;
            // @ts-expect-error the renderer does not take accountName
            void row.customer?.account?.accountName;
            // @ts-expect-error no column queries it
            void row.notQueried;
            // @ts-expect-error aliased: the row holds it under the alias
            void row.total;
            // @ts-expect-error status.id is not selected
            void row.status?.id;
            // @ts-expect-error id is a string
            const badId: number = row.id;
            void [id, amount, name, color, memo, accountNr, badId];
        };
        expect(typeof check).toBe('function');
    });

    it('keeps the typed fields of a view with an untyped column', () => {
        const untypedColumn: ColumnDefinition = column({
            rowType: Row,
            id: 'memo',
            name: 'Memo',
            data: [valueQuery({ field: 'memo' })],
            cellRenderer: () => null,
        });
        const mixedView = view({
            ...base,
            columnDefinitions: [
                column({ rowType: Row, id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
                untypedColumn,
            ],
        });
        const check = (row: SimplifiedRow<typeof mixedView>) => {
            const id: string = row.id;
            const memo: unknown = row.memo;
            // @ts-expect-error unknown, not any
            const notAString: string = row.memo;
            void [id, memo, notAString];
        };
        expect(typeof check).toBe('function');
        expect(mixedView.columnDefinitions).toHaveLength(2);
    });

    it('stays assignable to View', () => {
        const views: View[] = [invoiceView];
        expect(views).toHaveLength(1);
    });

    it('gives unknown fields for an untyped view', () => {
        const check = (row: SimplifiedRow<View>) => {
            const anything: unknown = row.whatever;
            // @ts-expect-error unknown, not any
            const notANumber: number = row.whatever;
            void [anything, notANumber];
        };
        expect(typeof check).toBe('function');
    });
});

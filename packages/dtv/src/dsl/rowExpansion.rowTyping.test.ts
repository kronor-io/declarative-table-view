import { describe, it, expect } from '@jest/globals';
import { rowExpansion } from './rowExpansion';
import { view } from './view';
import { filterGroup } from './filters';
import { column, rowType, valueQuery, arrayQuery } from './columns';

// Type-level regression tests for row-aware row expansions.
// These tests don't assert at runtime beyond the definition's shape; they fail if TypeScript can't typecheck.

type InvoiceRow = {
    id: string;
    note: string | null;
    lines: { sku: string; qty: number }[];
};

const Row = rowType<InvoiceRow>();

describe('dsl/rowExpansion', () => {
    it('types the data of an expansion that is not lazy', () => {
        const expansion = rowExpansion({
            rowType: Row,
            mode: 'single',
            data: [valueQuery({ field: 'note' }), arrayQuery({ field: 'lines', selectionSet: [valueQuery({ field: 'sku' })] })],
            canExpand: ({ data }) => data.lines.length > 0,
            render: ({ data, state }) => {
                const ready: 'ready' = state;
                const note: string | null = data.note;
                const skus: string[] = data.lines.map(line => line.sku);
                // @ts-expect-error qty is not selected
                void data.lines[0]?.qty;
                // @ts-expect-error id is not selected
                void data.id;
                return [ready, note, ...skus].join();
            },
        });

        expect(expansion).not.toHaveProperty('rowType');
        expect(expansion.data).toHaveLength(2);
    });

    it('lets the data of a lazy expansion be missing until it is ready', () => {
        rowExpansion({
            rowType: Row,
            mode: 'multiple',
            lazy: true,
            data: [valueQuery({ field: 'note' })],
            // Runs before the expansion has fetched anything.
            canExpand: ({ data }) => {
                const note: string | null | undefined = data.note;
                // @ts-expect-error can be missing
                const present: string | null = data.note;
                return note !== undefined && present !== undefined;
            },
            render: ({ data, state }) => {
                if (state !== 'ready') {
                    // @ts-expect-error can be missing while loading
                    const present: string | null = data.note;
                    return present;
                }
                const note: string | null = data.note;
                return note;
            },
        });
    });

    it('rejects a field that is not on the row', () => {
        rowExpansion({
            rowType: Row,
            mode: 'single',
            // @ts-expect-error not on the row
            data: [valueQuery({ field: 'missing' })],
            canExpand: () => true,
            render: () => null,
        });
    });

    it('fits a view', () => {
        const invoiceView = view({
            title: 'Invoices',
            id: 'invoices',
            source: { type: 'collection' as const, collectionName: 'invoices' },
            paginationKey: 'id',
            boolExpType: 'InvoiceBoolExp',
            orderByType: '[InvoiceOrderBy!]',
            filterGroups: [filterGroup({ name: 'default', label: null, filters: [] })],
            columnDefinitions: [
                column({ rowType: Row, id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
            ],
            rowExpansion: rowExpansion({
                rowType: Row,
                mode: 'single',
                lazy: true,
                data: [valueQuery({ field: 'note' })],
                canExpand: () => true,
                render: ({ data }) => data.note ?? null,
            }),
        });

        expect(invoiceView.rowExpansion?.lazy).toBe(true);
    });
});

import { describe, it, expect } from '@jest/globals';
import type AppComponent from './App';
import type { AppProps } from './App';
import type { View } from './framework/view';
import { view } from './dsl/view';
import { filterGroup } from './dsl/filters';
import { column, rowType, valueQuery } from './dsl/columns';

// Type-level regression tests for the rows App hands to onRowSelectionChange.
// These tests don't assert at runtime; they fail if TypeScript can't typecheck.

const viewOver = <Row extends { id: string }>(Row: Row, id: string) => view({
    title: id,
    id,
    source: { type: 'collection' as const, collectionName: id },
    paginationKey: 'id',
    boolExpType: 'BoolExp',
    orderByType: '[OrderBy!]',
    filterGroups: [filterGroup({ name: 'default', label: null, filters: [] })],
    columnDefinitions: [
        column({ rowType: Row, id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
    ],
});

const invoiceView = viewOver(rowType<{ id: string; total: number }>(), 'invoices');
const creditView = view({
    ...invoiceView,
    id: 'credits',
    columnDefinitions: [
        column({
            rowType: rowType<{ id: string; reason: string }>(),
            id: 'reason',
            name: 'Reason',
            data: [valueQuery({ field: 'reason' })],
            cellRenderer: () => null,
        }),
    ],
});

const required: Omit<AppProps, 'views' | 'rowSelection'> = {
    graphqlHost: 'http://localhost',
    requestHeaders: {},
    showViewsMenu: false,
    showViewTitle: false,
    syncFilterStateToUrl: false,
};

// Never called: App is only imported as a type, so these calls are only typechecked.
const typecheckOnly = (App: typeof AppComponent) => {
    App({
        ...required,
        views: [invoiceView],
        rowSelection: {
            rowSelectionType: 'multiple',
            onRowSelectionChange: rows => {
                const ids: string[] = rows.map(row => row.id);
                // @ts-expect-error no column of the view queries total
                void rows[0].total;
                void ids;
            },
        },
    });

    App({
        ...required,
        views: [invoiceView],
        rowSelection: {
            rowSelectionType: 'multiple',
            // @ts-expect-error the selection does not hold the whole row
            onRowSelectionChange: (rows: { id: string; total: number }[]) => void rows,
        },
    });

    // Several views: a row of either.
    App({
        ...required,
        views: [invoiceView, creditView],
        rowSelection: {
            rowSelectionType: 'multiple',
            onRowSelectionChange: rows => {
                const row = rows[0];
                const idOrReason: string = 'id' in row ? row.id : row.reason;
                void idOrReason;
            },
        },
    });

    // Untyped views (from JSON, or annotated as View) hand out rows whose fields are unknown.
    const untyped: View[] = [invoiceView];
    App({
        ...required,
        views: untyped,
        rowSelection: {
            rowSelectionType: 'multiple',
            onRowSelectionChange: rows => {
                const id: unknown = rows[0]?.id;
                void id;
            },
        },
    });
    App({
        ...required,
        viewsJson: '[]',
        rowSelection: {
            rowSelectionType: 'multiple',
            // @ts-expect-error nothing says what the rows of a JSON view hold
            onRowSelectionChange: (rows: { anything: number }[]) => void rows,
        },
    });
};

describe('App row selection typing', () => {
    it('typechecks', () => {
        expect(typeof typecheckOnly).toBe('function');
    });
});

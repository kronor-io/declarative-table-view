/**
 * @jest-environment jsdom
 *
 * The manager migrates each view's stored data to the current revision of the view's
 * definition, and writes it back at that revision.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY } from './user-data-manager';
import { defaultUserPreferences, viewMigrationContext, type UserDataJson, type ViewDataJson } from './user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import { defineMigration, defineViewMigrations } from '../dsl/migrations';
import type { FilterSchema } from './filters';
import type { View } from './view';
import * as FilterValue from './filterValue';

const textFilter = (id: string, field = id): FilterSchema => ({
    id,
    label: id,
    aiGenerated: false,
    expression: { type: 'equals', field, value: { type: 'text' } }
});

const textFilterProjection = (field: string) => ({ kind: 'leaf', cmp: 'equals', field, control: { type: 'text' } }) as const;

const v1 = {
    definition: 'payments',
    revision: 1,
    filters: { amt: textFilterProjection('amount'), status: textFilterProjection('status') },
    columns: {}
} as const;

const v2 = {
    definition: 'payments',
    revision: 2,
    filters: { amount: textFilterProjection('amount'), status: textFilterProjection('status') },
    columns: {}
} as const;

const chain = defineViewMigrations(v1, [defineMigration(v1, v2, m => [m.renameFilter('amt', 'amount')])]);

const viewOf = (id: string, filters: FilterSchema[], migrations = chain): View => ({
    id,
    title: id,
    source: { type: 'collection', collectionName: id },
    columnDefinitions: [],
    filterGroups: [{ name: 'default', label: null, filters }],
    boolExpType: 'BoolExp',
    orderByType: 'OrderBy',
    paginationKey: 'id',
    migrations
});

const leaf = (value: string) => ({ type: 'leaf', value: { type: 'value', value } });

const viewJson = (overrides: Partial<ViewDataJson> = {}): ViewDataJson => ({
    columnOrder: null,
    hiddenColumns: [],
    rowsPerPage: null,
    syncFilterStateToUserData: true,
    persistedFilterState: null,
    savedFilters: [],
    ...overrides
});

const store = (views: Record<string, ViewDataJson>) => localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify({
    preferences: defaultUserPreferences,
    views,
    revision: 4,
    formatRevision: CURRENT_USERDATA_FORMAT_REVISION
} satisfies UserDataJson));

const stored = () => JSON.parse(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY) as string) as UserDataJson;

function managerFor(views: View[], showToast = jest.fn()) {
    const migrationsByViewId = Object.fromEntries(views.map(view => [view.id, viewMigrationContext(view)!]));
    const filterGroupsByViewId = Object.fromEntries(views.map(view => [view.id, view.filterGroups]));
    return createUserDataManager(filterGroupsByViewId, { showToast, migrationsByViewId });
}

describe('user-data-manager view-level migrations', () => {
    let consoleError: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('migrates stored data to the current revision and writes it back at that revision', async () => {
        store({ payments: viewJson({ persistedFilterState: { amt: leaf('5'), status: leaf('PAID') } }) });
        const showToast = jest.fn();

        const manager = managerFor([viewOf('payments', [textFilter('amount'), textFilter('status')])], showToast);
        await manager.ready;

        expect(manager.getViewData('payments').persistedFilterState?.get('amount')).toEqual({ type: 'leaf', value: FilterValue.value('5') });
        expect(stored().revision).toBe(5);
        expect(stored().views.payments).toMatchObject({ definitionRevision: 2, persistedFilterState: { amount: leaf('5'), status: leaf('PAID') } });
        // A rename resets nothing, so there is nothing to tell the user.
        expect(showToast).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('lets a view renamed between snapshots take over the data stored under its old id', async () => {
        const renamed = {
            ...v2,
            definition: 'payment-list',
            revision: 3
        } as const;
        const renamingChain = defineViewMigrations(v1, [
            defineMigration(v1, v2, m => [m.renameFilter('amt', 'amount')]),
            defineMigration(v2, renamed, () => [])
        ]);
        store({ payments: viewJson({ hiddenColumns: ['x'], persistedFilterState: { amt: leaf('5') } }), other: viewJson() });

        const manager = managerFor([viewOf('payment-list', [textFilter('amount'), textFilter('status')], renamingChain)]);
        await manager.ready;

        expect(manager.getViewData('payment-list').hiddenColumns).toEqual(['x']);
        expect(Object.keys(stored().views).sort()).toEqual(['other', 'payment-list']);
        expect(stored().views['payment-list'].definitionRevision).toBe(3);
    });

    it('resets the stored state of filters changed since the latest snapshot, and says so', async () => {
        store({ payments: viewJson({ definitionRevision: 2, persistedFilterState: { amount: leaf('5'), status: leaf('PAID') } }) });
        const showToast = jest.fn();

        // `status` now filters another field, but no revision was made for it.
        const manager = managerFor([viewOf('payments', [textFilter('amount'), textFilter('status', 'state')])], showToast);
        await manager.ready;

        const persisted = manager.getViewData('payments').persistedFilterState;
        expect(persisted?.get('amount')).toEqual({ type: 'leaf', value: FilterValue.value('5') });
        expect(persisted?.get('status')).toEqual({ type: 'leaf', value: FilterValue.empty });
        expect((showToast.mock.calls[0][0] as { detail: string }).detail).toContain('current filters: status');
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('differs from revision 2 of its definition "payments"'));
    });

    it('does not take a column the snapshot lacks for a change, e.g. one shown only with row actions', async () => {
        const withActions = {
            ...viewOf('payments', [textFilter('amount'), textFilter('status')]),
            columnDefinitions: [{ type: 'tableColumn', id: 'actions', name: 'Actions', data: [{ type: 'valueQuery', field: 'id' }], cellRenderer: () => null }]
        } as unknown as View;

        expect(viewMigrationContext(withActions)).toBeDefined();
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('leaves data stored for a newer revision than it knows alone', async () => {
        store({ payments: viewJson({ definitionRevision: 3, hiddenColumns: ['newer'] }) });

        const manager = managerFor([viewOf('payments', [textFilter('amount'), textFilter('status')])]);
        await manager.ready;
        await manager.setHiddenColumns('payments', ['older']);

        expect(stored().views.payments).toMatchObject({ definitionRevision: 3, hiddenColumns: ['newer'] });
    });
});

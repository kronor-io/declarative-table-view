/**
 * @jest-environment jsdom
 *
 * How the manager decodes views against their definitions: resets, retained views, and
 * stored data it must leave alone.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY, type UserDataSaveAPI } from './user-data-manager';
import { defaultUserPreferences, REVISION_2026_01_29, type UserDataJson, type ViewDataJson } from './user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import type { FilterExpr, FilterGroups } from './filters';
import * as FilterValue from './filterValue';
import { success } from './result';

const VIEW = 'view-a';

const dateLeaf = (type: 'greaterThanOrEqual' | 'lessThanOrEqual'): FilterExpr => ({ type, field: 'createdAt', value: { type: 'date' } });

/** `created` used to be a range of two dates; now it has a third bound. */
const filterGroups = (createdChildren: number): Record<string, FilterGroups> => ({
    [VIEW]: [{
        name: 'default',
        label: null,
        filters: [
            {
                id: 'created',
                label: 'Created',
                expression: { type: 'and', filters: Array.from({ length: createdChildren }, (_, index) => dateLeaf(index % 2 === 0 ? 'greaterThanOrEqual' : 'lessThanOrEqual')) },
                aiGenerated: false
            },
            {
                id: 'status',
                label: 'Status',
                expression: { type: 'equals', field: 'status', value: { type: 'text' } },
                aiGenerated: false
            },
            {
                id: 'amount',
                label: 'Amount',
                expression: {
                    type: 'equals',
                    field: 'amount',
                    value: { type: 'customOperator', operators: [{ label: 'equals', value: '_eq' }], valueControl: { type: 'number' } }
                },
                aiGenerated: false
            }
        ]
    }]
});

const twoDateRange = {
    type: 'and',
    children: [
        { type: 'leaf', value: { type: 'value', value: '2026-01-01T00:00:00.000Z' } },
        { type: 'leaf', value: { type: 'value', value: '2026-02-01T00:00:00.000Z' } }
    ]
};

const viewJson = (overrides: Partial<ViewDataJson> = {}): ViewDataJson => ({
    columnOrder: null,
    hiddenColumns: [],
    rowsPerPage: null,
    syncFilterStateToUserData: true,
    persistedFilterState: null,
    savedFilters: [],
    ...overrides
});

const userDataJson = (views: Record<string, ViewDataJson>, revision: number, formatRevision = CURRENT_USERDATA_FORMAT_REVISION): UserDataJson => ({
    preferences: defaultUserPreferences,
    views,
    revision,
    formatRevision
});

const localStorageJson = () => JSON.parse(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY) as string) as UserDataJson;

function createRemote(initial: unknown) {
    const writes: UserDataJson[] = [];
    return {
        writes,
        load: async () => success(initial as UserDataJson | null),
        save: async ({ data }: UserDataSaveAPI) => {
            writes.push(data);
            return success(undefined);
        }
    };
}

describe('user-data-manager view decoding', () => {
    let consoleWarn: ReturnType<typeof jest.spyOn>;
    let consoleError: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleWarn.mockRestore();
        consoleError.mockRestore();
    });

    it('resets filters that no longer fit the view, says which, and writes the result once', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({
                persistedFilterState: { created: twoDateRange, status: { type: 'leaf', value: { type: 'value', value: 'PAID' } } },
                savedFilters: [{
                    id: 'sf-1',
                    name: 'January',
                    view: VIEW,
                    state: { created: twoDateRange, amount: { type: 'leaf', value: { type: 'value', value: { operator: '_gt', value: { type: 'value', value: 5 } } } } },
                    createdAt: '2026-01-02T00:00:00.000Z',
                    formatRevision: 'rev'
                }]
            })
        }, 4)));
        const showToast = jest.fn();

        const manager = createUserDataManager(filterGroups(3), { showToast });
        await manager.ready;

        const viewData = manager.getViewData(VIEW);
        expect(viewData.persistedFilterState?.get('status')).toEqual({ type: 'leaf', value: FilterValue.value('PAID') });
        expect(viewData.persistedFilterState?.get('created')).toMatchObject({ type: 'and', children: [{}, {}, {}] });
        // `_gt` is not one of the filter's operators (any more): reset to the first one, empty.
        expect(viewData.savedFilters[0].state.get('amount')).toEqual({ type: 'leaf', value: FilterValue.value({ operator: '_eq', value: FilterValue.empty }) });

        expect(showToast).toHaveBeenCalledTimes(1);
        const toast = showToast.mock.calls[0][0] as { severity: string; detail: string };
        expect(toast.severity).toBe('warn');
        expect(toast.detail).toContain('current filters: Created');
        expect(toast.detail).toContain('saved filter "January": Created, Amount');

        // Written back, so the next start finds nothing to reset.
        expect(localStorageJson().revision).toBe(5);
        expect(localStorageJson().views[VIEW].savedFilters[0].state).toEqual({});

        const nextToast = jest.fn();
        await createUserDataManager(filterGroups(3), { showToast: nextToast }).ready;
        expect(nextToast).not.toHaveBeenCalled();
    });

    it('resolves leaves stored before filter values were tagged against the filter schema', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({
                savedFilters: [{
                    id: 'sf-1',
                    name: 'Old',
                    view: VIEW,
                    state: {
                        status: { type: 'leaf', value: 'PAID' },
                        amount: { type: 'leaf', value: { operator: '_eq', value: 5 } },
                        created: { type: 'and', children: [{ type: 'leaf', value: '2026-01-01T00:00:00.000Z' }, { type: 'leaf', value: '' }] }
                    },
                    createdAt: '2026-01-02T00:00:00.000Z',
                    formatRevision: 'rev'
                }]
            })
        }, 1, REVISION_2026_01_29)));

        const manager = createUserDataManager(filterGroups(2), { showToast: jest.fn() });
        await manager.ready;

        const state = manager.getViewData(VIEW).savedFilters[0].state;
        expect(state.get('status')).toEqual({ type: 'leaf', value: FilterValue.value('PAID') });
        expect(state.get('amount')).toEqual({ type: 'leaf', value: FilterValue.value({ operator: '_eq', value: FilterValue.value(5) }) });
        expect(state.get('created')).toEqual({
            type: 'and',
            children: [
                { type: 'leaf', value: FilterValue.value(new Date('2026-01-01T00:00:00.000Z')) },
                { type: 'leaf', value: FilterValue.empty }
            ]
        });
    });

    it('does not replace a view written for a newer revision of its definition', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['newer'], definitionRevision: 2 })
        }, 4)));

        const manager = createUserDataManager(filterGroups(2), { showToast: jest.fn() });
        await manager.ready;
        // This version knows nothing of revision 2, so it works from defaults...
        expect(manager.getViewData(VIEW).hiddenColumns).toEqual([]);

        // ...and a change it makes stays in memory: the stored view is left as it was.
        await manager.setHiddenColumns(VIEW, ['older']);
        expect(manager.getViewData(VIEW).hiddenColumns).toEqual(['older']);
        expect(localStorageJson().views[VIEW]).toMatchObject({ hiddenColumns: ['newer'], definitionRevision: 2 });
    });

    it('becomes read-only when the remote copy is at a format revision it cannot migrate from', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson({ hiddenColumns: ['newer'] }) }, 9, '2099-01-01T00:00:00.000Z'));
        const showToast = jest.fn();

        const manager = createUserDataManager(filterGroups(2), { load: remote.load, save: remote.save, showToast });
        await manager.ready;
        await manager.setRowsPerPage(VIEW, 50);

        expect(remote.writes).toEqual([]);
        expect(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)).toBeNull();
        expect(showToast.mock.calls.map(args => (args[0] as { summary?: string }).summary)).toEqual(['Failed to read user data']);
    });

    it('becomes read-only instead of overwriting what a newer version wrote to localStorage since it started', async () => {
        const manager = createUserDataManager(filterGroups(2), { showToast: jest.fn() });
        await manager.ready;

        const fromANewerVersion = JSON.stringify(userDataJson({ [VIEW]: viewJson({ hiddenColumns: ['newer'] }) }, 9, '2099-01-01T00:00:00.000Z'));
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, fromANewerVersion);

        await manager.setRowsPerPage(VIEW, 50);
        expect(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)).toBe(fromANewerVersion);
    });

    it('keeps a view whose stored fields are invalid, with those fields at their defaults', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: { ...viewJson({ hiddenColumns: ['kept'] }), rowsPerPage: 'fifty', savedFilters: [{ name: 'no id' }] } as unknown as ViewDataJson
        }, 4)));

        const manager = createUserDataManager(filterGroups(2), { showToast: jest.fn() });
        await manager.ready;

        expect(manager.getViewData(VIEW)).toMatchObject({ hiddenColumns: ['kept'], rowsPerPage: null, savedFilters: [] });
    });
});

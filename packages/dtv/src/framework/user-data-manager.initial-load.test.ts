/**
 * @jest-environment jsdom
 *
 * What the manager does with the local and the remote copy when it starts.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY, type UserDataSaveAPI } from './user-data-manager';
import { defaultUserPreferences, INITIAL_USERDATA_FORMAT_REVISION, type UserDataJson, type ViewDataJson } from './user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import type { FilterGroups } from './filters';
import { success } from './result';

const VIEW = 'view-a';
/** A view of another page: this manager has no schema for it and cannot hydrate it. */
const UNKNOWN_VIEW = 'other-page-view';

const filterGroupsByViewId: Record<string, FilterGroups> = {
    [VIEW]: [{ name: 'default', label: null, filters: [] }]
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

function createRemote(initial: UserDataJson | null) {
    const writes: UserDataJson[] = [];
    return {
        writes,
        load: async () => success(initial),
        save: async ({ data }: UserDataSaveAPI) => {
            writes.push(data);
            return success(undefined);
        }
    };
}

describe('user-data-manager initial load', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('takes unknown views from a newer remote copy instead of the older ones in localStorage', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['local'] }),
            [UNKNOWN_VIEW]: viewJson({ hiddenColumns: ['stale'] })
        }, 3)));
        const remote = createRemote(userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['remote'] }),
            [UNKNOWN_VIEW]: viewJson({ hiddenColumns: ['fresh'] })
        }, 5));

        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await manager.ready;

        expect(manager.getViewData(VIEW).hiddenColumns).toEqual(['remote']);
        expect(localStorageJson().revision).toBe(5);
        expect(localStorageJson().views[UNKNOWN_VIEW].hiddenColumns).toEqual(['fresh']);
        // The remote is up to date: nothing is written back to it.
        expect(remote.writes).toEqual([]);
    });

    it('works from defaults and leaves both stores alone when the stored data cannot be migrated', async () => {
        const fromANewerVersion = JSON.stringify(userDataJson({ [VIEW]: viewJson({ hiddenColumns: ['newer'] }) }, 9, '2099-01-01T00:00:00.000Z'));
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, fromANewerVersion);
        const remote = createRemote(null);
        const showToast = jest.fn();
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast });
        await manager.ready;
        const viewData = await manager.setRowsPerPage(VIEW, 50);

        expect(viewData).toMatchObject({ rowsPerPage: 50, hiddenColumns: [] });
        expect(remote.writes).toEqual([]);
        expect(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)).toBe(fromANewerVersion);
        expect(showToast.mock.calls.map(args => (args[0] as { summary?: string }).summary)).toEqual(['Failed to read user data']);
        consoleError.mockRestore();
    });

    it('writes migrated data back to the remote with a higher revision', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5, INITIAL_USERDATA_FORMAT_REVISION));

        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await manager.ready;

        expect(remote.writes.map(write => [write.revision, write.formatRevision])).toEqual([[6, CURRENT_USERDATA_FORMAT_REVISION]]);
        expect(localStorageJson().revision).toBe(6);
    });
});

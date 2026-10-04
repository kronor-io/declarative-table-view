/**
 * @jest-environment jsdom
 *
 * Concurrent writers (other tabs, other devices) against a remote that applies a write
 * only when its revision is greater than the stored one, the way finance's
 * `update_dtv_user_data` does.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY, type UserDataSaveAPI } from './user-data-manager';
import { defaultUserPreferences, type UserDataJson, type ViewDataJson } from './user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import type { FilterGroups } from './filters';
import { failure, success } from './result';

const VIEW = 'view-a';
const OTHER_VIEW = 'view-b';
/** A view of another page: this manager has no schema for it and cannot hydrate it. */
const UNKNOWN_VIEW = 'other-page-view';

const filterGroupsByViewId: Record<string, FilterGroups> = {
    [VIEW]: [{ name: 'default', label: null, filters: [] }],
    [OTHER_VIEW]: [{ name: 'default', label: null, filters: [] }]
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

const userDataJson = (views: Record<string, ViewDataJson>, revision: number): UserDataJson => ({
    preferences: defaultUserPreferences,
    views,
    revision,
    formatRevision: CURRENT_USERDATA_FORMAT_REVISION
});

const localStorageJson = () => JSON.parse(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY) as string) as UserDataJson;

/** The remote row. A write is applied (top-level merge) only when its revision is greater. */
function createRemote(initial: UserDataJson | null, options: { saveDelayMs?: number } = {}) {
    let stored = initial;
    const writes: UserDataJson[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let failNextSaveWith: string | null = null;

    return {
        get stored() {
            return stored;
        },
        /** What another device wrote directly to the remote. */
        set stored(next: UserDataJson | null) {
            stored = next;
        },
        writes,
        get maxInFlight() {
            return maxInFlight;
        },
        /** Makes the next write fail for a reason other than a stale revision. */
        failNextSave(message: string) {
            failNextSaveWith = message;
        },
        load: async () => success(stored),
        save: async ({ data }: UserDataSaveAPI) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            if (options.saveDelayMs) {
                await new Promise(resolve => setTimeout(resolve, options.saveDelayMs));
            }
            inFlight -= 1;
            writes.push(data);
            if (failNextSaveWith !== null) {
                const message = failNextSaveWith;
                failNextSaveWith = null;
                return failure(message);
            }
            if (stored !== null && data.revision <= stored.revision) {
                return failure('Stale revision: user data was not updated');
            }
            stored = { ...stored, ...data };
            return success(undefined);
        }
    };
}

const errorToasts = (showToast: jest.Mock) =>
    showToast.mock.calls.map(args => args[0] as { severity: string; summary?: string }).filter(toast => toast.severity === 'error');

describe('user-data-manager with concurrent writers', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('applies a rejected write on top of the remote copy and writes again', async () => {
        const remote = createRemote(userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['a'] }),
            [OTHER_VIEW]: viewJson({ rowsPerPage: 25 })
        }, 5));
        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast });
        await manager.ready;

        // Another device changes the other view; this tab knows nothing about revision 7.
        remote.stored = userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['a'] }),
            [OTHER_VIEW]: viewJson({ rowsPerPage: 100 })
        }, 7);

        const viewData = await manager.setHiddenColumns(VIEW, ['x']);

        expect(remote.writes.map(write => write.revision)).toEqual([6, 8]);
        expect(viewData.hiddenColumns).toEqual(['x']);
        expect(remote.stored?.revision).toBe(8);
        expect(remote.stored?.views[VIEW].hiddenColumns).toEqual(['x']);
        // The other view keeps the remote's newer value instead of this tab's stale copy.
        expect(remote.stored?.views[OTHER_VIEW].rowsPerPage).toBe(100);
        expect(manager.getViewData(OTHER_VIEW).rowsPerPage).toBe(100);
        expect(localStorageJson().revision).toBe(8);
        expect(errorToasts(showToast)).toEqual([]);
    });

    it('does not write again when the remote is not ahead, so a change is applied once', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5));
        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast });
        await manager.ready;

        remote.failNextSave('network down');
        await manager.createFilter({ name: 'Mine', view: VIEW, state: new Map() });

        expect(remote.writes.map(write => write.revision)).toEqual([6]);
        expect(manager.getSavedFilters(VIEW).map(filter => filter.name)).toEqual(['Mine']);
        expect(remote.stored?.revision).toBe(5);
        expect(errorToasts(showToast).map(toast => toast.summary)).toEqual(['Failed to save filter']);
    });

    it('settles a manager created while a write of this tab is still in flight, without a toast', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5), { saveDelayMs: 10 });
        const first = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await first.ready;

        // The write is in flight when a second manager starts (the consumer handed DTV a new
        // `views` reference). It finds localStorage ahead of the remote and pushes the same
        // revision, which the remote then rejects.
        const write = first.setHiddenColumns(VIEW, ['x']);
        const showToast = jest.fn();
        const second = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast });
        await Promise.all([write, second.ready]);

        expect(remote.writes.map(write => write.revision)).toEqual([6, 6]);
        expect(remote.stored?.revision).toBe(6);
        expect(remote.stored?.views[VIEW].hiddenColumns).toEqual(['x']);
        expect(second.getViewData(VIEW).hiddenColumns).toEqual(['x']);
        expect(errorToasts(showToast)).toEqual([]);
    });

    it('builds on the revision and content another tab stored in localStorage', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5));
        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast });
        await manager.ready;

        // Another tab writes revision 9 (localStorage is shared, and its remote write succeeded).
        const otherTabWrite = userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['from-other-tab'] }),
            [OTHER_VIEW]: viewJson({ rowsPerPage: 40 })
        }, 9);
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(otherTabWrite));
        remote.stored = otherTabWrite;

        const viewData = await manager.setRowsPerPage(VIEW, 50);

        expect(remote.writes.map(write => write.revision)).toEqual([10]);
        expect(viewData).toMatchObject({ rowsPerPage: 50, hiddenColumns: ['from-other-tab'] });
        expect(remote.stored?.views[VIEW]).toMatchObject({ rowsPerPage: 50, hiddenColumns: ['from-other-tab'] });
        expect(remote.stored?.views[OTHER_VIEW].rowsPerPage).toBe(40);
        expect(errorToasts(showToast)).toEqual([]);
    });

    it('carries unknown views from the remote copy, not from localStorage, when writing again', async () => {
        const remote = createRemote(userDataJson({
            [VIEW]: viewJson(),
            [UNKNOWN_VIEW]: viewJson({ hiddenColumns: ['stale'] })
        }, 5));
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await manager.ready;
        expect(localStorageJson().views[UNKNOWN_VIEW].hiddenColumns).toEqual(['stale']);

        // Another device changes the other page's view; localStorage here still has the stale copy.
        remote.stored = userDataJson({
            [VIEW]: viewJson(),
            [UNKNOWN_VIEW]: viewJson({ hiddenColumns: ['fresh'] })
        }, 7);

        await manager.setHiddenColumns(VIEW, ['x']);

        expect(remote.writes.map(write => write.revision)).toEqual([6, 8]);
        expect(remote.stored?.views[UNKNOWN_VIEW].hiddenColumns).toEqual(['fresh']);
        expect(remote.stored?.views[VIEW].hiddenColumns).toEqual(['x']);
        expect(localStorageJson().views[UNKNOWN_VIEW].hiddenColumns).toEqual(['fresh']);
    });

    it('adopts another tab\'s data when refreshed from localStorage', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5));
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await manager.ready;

        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({ columnOrder: ['b', 'a'] })
        }, 6)));
        expect(manager.getViewData(VIEW).columnOrder).toBeNull();

        manager.refreshFromLocalStorage();

        expect(manager.getViewData(VIEW).columnOrder).toEqual(['b', 'a']);
    });

    it('ignores a localStorage copy with a lower revision than its own', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson({ columnOrder: ['kept'] }) }, 5));
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await manager.ready;

        // A writer that never saw revision 5 (an older tab) overwrites localStorage.
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({ columnOrder: ['rolled-back'] })
        }, 4)));

        manager.refreshFromLocalStorage();

        expect(manager.getViewData(VIEW).columnOrder).toEqual(['kept']);
    });

    it('reports a failing localStorage write as a warning and still writes to the remote', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5));
        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast });
        await manager.ready;

        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });
        const viewData = await manager.setRowsPerPage(VIEW, 50);
        setItem.mockRestore();

        expect(viewData.rowsPerPage).toBe(50);
        expect(remote.stored?.views[VIEW].rowsPerPage).toBe(50);
        const toasts = showToast.mock.calls.map(args => args[0] as { severity: string; summary?: string; detail?: string });
        expect(toasts).toEqual([
            expect.objectContaining({ severity: 'warn', summary: 'Saving user data locally failed', detail: expect.stringContaining('quota exceeded') })
        ]);
    });

    it('sends writes one at a time, in order', async () => {
        const remote = createRemote(userDataJson({ [VIEW]: viewJson() }, 5), { saveDelayMs: 10 });
        const manager = createUserDataManager(filterGroupsByViewId, { load: remote.load, save: remote.save, showToast: jest.fn() });
        await manager.ready;

        await Promise.all([
            manager.setHiddenColumns(VIEW, ['h']),
            manager.setRowsPerPage(VIEW, 50)
        ]);

        expect(remote.maxInFlight).toBe(1);
        expect(remote.writes.map(write => write.revision)).toEqual([6, 7]);
        expect(remote.stored?.views[VIEW]).toMatchObject({ hiddenColumns: ['h'], rowsPerPage: 50 });
    });

    it('keeps the local data when pushing it to an empty remote fails', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['kept'] })
        }, 3)));
        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, {
            load: async () => success(null),
            save: async () => failure('Simulated remote failure'),
            showToast
        });
        await manager.ready;

        expect(manager.getViewData(VIEW).hiddenColumns).toEqual(['kept']);
        expect(localStorageJson().revision).toBe(3);
        expect(errorToasts(showToast).map(toast => toast.summary)).toEqual(['Syncing user data failed']);
    });

    it('does not push local data over a remote it could not load', async () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(userDataJson({
            [VIEW]: viewJson({ hiddenColumns: ['kept'] })
        }, 3)));
        const save = jest.fn(async () => success(undefined));
        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, {
            load: async () => failure('Simulated load failure'),
            save,
            showToast
        });
        await manager.ready;

        expect(save).not.toHaveBeenCalled();
        expect(manager.getViewData(VIEW).hiddenColumns).toEqual(['kept']);
        expect(errorToasts(showToast).map(toast => toast.summary)).toEqual(['Loading user data failed']);
    });
});

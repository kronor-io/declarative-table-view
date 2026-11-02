/**
 * @jest-environment jsdom
 *
 * The user data manager reports how its initial load went, and writes that fail or conflict.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createUserDataManager, type UserDataAnalyticsEvent, type UserDataSaveAPI } from './user-data-manager';
import { defaultUserPreferences, type UserDataJson } from './user-data';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import type { FilterGroups } from './filters';
import { failure, success, type Result } from './result';

const VIEW = 'view-a';
const filterGroupsByViewId: Record<string, FilterGroups> = { [VIEW]: [{ name: 'default', label: null, filters: [] }] };

const userDataJson = (revision: number): UserDataJson => ({
    preferences: defaultUserPreferences,
    views: { [VIEW]: { columnOrder: null, hiddenColumns: [], rowsPerPage: null, savedFilters: [] } },
    revision,
    formatRevision: CURRENT_USERDATA_FORMAT_REVISION
});

function managerWith(load: () => Promise<Result<string, UserDataJson | null>>, save: (api: UserDataSaveAPI) => Promise<Result<string, void>>) {
    const events: UserDataAnalyticsEvent[] = [];
    const manager = createUserDataManager(filterGroupsByViewId, { load, save, showToast: jest.fn() });
    manager.reportTo(event => events.push(event));
    return { manager, events };
}

describe('user data analytics', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('reports the initial load: from the remote copy, how long it took, nothing reset', async () => {
        const { manager, events } = managerWith(async () => success(userDataJson(5)), async () => success(undefined));
        await manager.ready;

        expect(events).toEqual([{
            type: 'userDataLoad',
            startedAt: expect.any(Number),
            durationMs: expect.any(Number),
            outcome: 'succeeded',
            source: 'remote',
            migrated: false,
            resets: [],
            retainedViews: []
        }]);
    });

    it('reports a failed load, after which the table goes on with the local copy', async () => {
        const { manager, events } = managerWith(async () => failure('the API is down'), async () => success(undefined));
        await manager.ready;

        expect(events).toEqual([expect.objectContaining({
            type: 'userDataLoad',
            outcome: 'failed',
            source: 'local',
            error: { kind: 'externalLoadFailed', message: 'the API is down' }
        })]);
    });

    it('holds its events until it is told where to report them', async () => {
        const manager = createUserDataManager(filterGroupsByViewId, { load: async () => failure('the API is down'), save: async () => failure('no'), showToast: jest.fn() });
        await manager.ready;
        await manager.setHiddenColumns(VIEW, ['x']);

        const events: UserDataAnalyticsEvent[] = [];
        manager.reportTo(event => events.push(event));

        expect(events.map(event => event.type)).toEqual(['userDataLoad', 'userDataSaveFailed']);
    });

    it('reports a write another device got in first, and that writing again resolved it', async () => {
        let stored = userDataJson(5);
        const { manager, events } = managerWith(async () => success(stored), async ({ data }) => {
            if (data.revision <= stored.revision) return failure('Stale revision');
            stored = data;
            return success(undefined);
        });
        await manager.ready;

        stored = userDataJson(7);
        await manager.setHiddenColumns(VIEW, ['x']);

        expect(events.slice(1)).toEqual([{ type: 'userDataConflict', resolved: true }]);
    });

    it('reports a write that failed, and still hands back the saved filter it kept locally', async () => {
        const { manager, events } = managerWith(async () => success(userDataJson(5)), async () => failure('network down'));
        await manager.ready;

        const saved = await manager.createFilter({ name: 'Mine', view: VIEW, state: new Map() });

        expect(events.slice(1)).toEqual([{ type: 'userDataSaveFailed', error: { kind: 'externalSaveFailed', message: 'network down' } }]);
        expect(manager.getSavedFilters(VIEW).map(filter => filter.id)).toEqual([saved.id]);
    });
});

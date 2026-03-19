/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY } from './user-data-manager';
import type { FilterGroups } from './filters';
import { failure } from './result';

describe('user-data-manager remote failure behavior', () => {
    it('persists locally and shows toast on remote save failure without throwing', async () => {
        // Minimal filter schema for a single view
        const filterGroupsByViewId: Record<string, FilterGroups> = {
            'test-view': [{ name: 'default', label: null, filters: [] }]
        };

        const showToast = jest.fn();
        const manager = createUserDataManager(filterGroupsByViewId, {
            load: undefined,
            save: jest.fn(async () => failure('Simulated remote failure')),
            showToast
        });

        // Prime localStorage
        localStorage.removeItem(USER_DATA_LOCALSTORAGE_KEY);

        // Attempt to update view data; should not throw and localStorage should be written
        await manager.setRowsPerPage('test-view', 50);

        const raw = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY);
        expect(raw).toBeTruthy();
        const json = raw ? JSON.parse(raw) : null;
        expect(json).toBeTruthy();
        expect(json.views['test-view'].rowsPerPage).toBe(50);

        // Expect a warning toast about external failure
        expect(showToast).toHaveBeenCalled();
        const calls = showToast.mock.calls.map(args => args[0]);
        const toastCall = calls.find((c: any) => c?.severity === 'error' && c?.summary === 'Syncing user data failed');
        expect(toastCall).toBeDefined();
        const toast = toastCall as any;
        expect(toast.detail).toContain('Simulated remote failure');
    });
});

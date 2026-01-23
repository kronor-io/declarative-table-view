import { createUserDataManager, USER_DATA_LOCALSTORAGE_KEY } from './user-data-manager';
import { CURRENT_FORMAT_REVISION } from './saved-filters';
import { INITIAL_USERDATA_FORMAT_REVISION, type UserDataJson } from './user-data';
import { filterControl, filterExpr, type FilterSchemasAndGroups } from './filters';

describe('user-data save merges existing views from localStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('preserves unknown views from localStorage and passes merged JSON to save callback', () => {
        const viewA: string = 'view-a';
        const unknownView: string = 'unknown-view';

        // Minimal filter schema for view-a only
        const schemaA: FilterSchemasAndGroups = {
            groups: [{ name: 'default', label: null }],
            filters: [{ id: 'f1', label: 'F1', group: 'default', aiGenerated: false, expression: filterExpr.equals('field', filterControl.text()) }]
        };

        // Seed localStorage with user-data JSON that includes an unknown view
        const existingJson: UserDataJson = {
            preferences: { theme: 'dark' },
            views: {
                [unknownView]: {
                    columnOrder: null,
                    hiddenColumns: ['legacy-col'],
                    rowsPerPage: 25,
                    savedFilters: [
                        {
                            id: 'sf-unknown',
                            name: 'Unknown Filter',
                            view: unknownView,
                            state: { some: 'state' },
                            createdAt: '2026-01-01T00:00:00.000Z',
                            formatRevision: CURRENT_FORMAT_REVISION
                        }
                    ]
                }
            },
            revision: 1,
            formatRevision: INITIAL_USERDATA_FORMAT_REVISION
        };
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, JSON.stringify(existingJson));

        // Spy save callback to capture payload
        const saveCallbackPayloads: UserDataJson[] = [];
        const manager = createUserDataManager({ [viewA]: schemaA }, {
            showToast: () => {},
            save: async ({ data }) => {
                saveCallbackPayloads.push(data);
            }
        });

        // Trigger a save by updating managed view-a
        const updatedHidden = ['col-1'];
        manager.updateViewData(viewA as any, (prev) => ({ ...prev, hiddenColumns: updatedHidden }));

        // Verify localStorage holds merged JSON
        const mergedJsonRaw = localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY);
        expect(mergedJsonRaw).toBeTruthy();
        const mergedJson = JSON.parse(mergedJsonRaw as string) as UserDataJson;

        // unknown view preserved
        expect(mergedJson.views[unknownView]).toBeTruthy();
        expect(mergedJson.views[unknownView].hiddenColumns).toEqual(['legacy-col']);
        expect(mergedJson.views[unknownView].savedFilters?.[0]?.id).toBe('sf-unknown');

        // managed view updated
        expect(mergedJson.views[viewA]).toBeTruthy();
        expect(mergedJson.views[viewA].hiddenColumns).toEqual(updatedHidden);

        // Save callback received the full merged JSON (may be called initially by ready)
        const lastPayload = saveCallbackPayloads[saveCallbackPayloads.length - 1];
        expect(lastPayload).toEqual(mergedJson);
    });
});

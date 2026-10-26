import { describe, expect, it } from '@jest/globals';
import { decode } from './decoder';
import { undecodedFilterState, userDataWithUndecodedViews } from './user-data-undecoded';
import { CURRENT_USERDATA_FORMAT_REVISION } from './user-data.migrations';
import { isSuccess, unwrapResult } from './result';

describe('user data decoded up to the views', () => {
    it('tags filter values written before 2026-03-26 as legacy, and keeps tagged ones', () => {
        const { result } = decode(undecodedFilterState, {
            status: { type: 'leaf', value: 'PAID' },
            amount: { type: 'leaf', value: { operator: '_eq', value: 5 } },
            cleared: { type: 'leaf', value: { type: 'empty' } },
            tagged: { type: 'leaf', value: { type: 'value', value: [1, 2] } },
            alreadyLegacy: { type: 'leaf', value: { type: 'legacy', raw: 'x' } }
        });

        expect(unwrapResult(result)).toEqual({
            status: { type: 'leaf', value: { type: 'legacy', raw: 'PAID' } },
            amount: { type: 'leaf', value: { type: 'legacy', raw: { operator: '_eq', value: 5 } } },
            cleared: { type: 'leaf', value: { type: 'empty' } },
            tagged: { type: 'leaf', value: { type: 'value', value: [1, 2] } },
            alreadyLegacy: { type: 'leaf', value: { type: 'legacy', raw: 'x' } }
        });
    });

    it('drops a filter whose stored state is not a filter state, keeping the others', () => {
        const { result, issues } = decode(undecodedFilterState, {
            ok: { type: 'leaf', value: { type: 'empty' } },
            notAState: 'x',
            unknownNode: { type: 'xor', children: [] },
            badChild: { type: 'and', children: [{ type: 'leaf', value: { type: 'empty' } }, 42] }
        });

        expect(Object.keys(unwrapResult(result))).toEqual(['ok']);
        expect(issues.map(issue => issue.path)).toEqual(['$.notAState', '$.unknownNode.type', '$.badChild.children[1]']);
    });

    it('fills in what older formats lack, and decodes the same after a round trip', () => {
        const stored = {
            preferences: { closeFilterPanelOnApply: true },
            views: {
                'view-a': {
                    hiddenColumns: ['h'],
                    savedFilters: [{ id: 'sf', name: 'Saved', createdAt: '2026-01-01T00:00:00.000Z', state: { s: { type: 'leaf', value: 'x' } } }]
                }
            },
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        };

        const decoded = unwrapResult(decode(userDataWithUndecodedViews, stored).result);
        expect(decoded).toEqual({
            preferences: { syncFilterStateToUrlOverride: null, closeFilterPanelOnApply: true },
            views: {
                'view-a': {
                    columnOrder: null,
                    hiddenColumns: ['h'],
                    rowsPerPage: null,
                    syncFilterStateToUserData: true,
                    persistedFilterState: null,
                    definitionRevision: 1,
                    savedFilters: [{
                        id: 'sf',
                        name: 'Saved',
                        view: '',
                        formatRevision: '',
                        createdAt: '2026-01-01T00:00:00.000Z',
                        state: { s: { type: 'leaf', value: { type: 'legacy', raw: 'x' } } }
                    }]
                }
            },
            revision: 0,
            formatRevision: CURRENT_USERDATA_FORMAT_REVISION
        });

        const again = decode(userDataWithUndecodedViews, JSON.parse(JSON.stringify(decoded)));
        expect(isSuccess(again.result) && again.result.value).toEqual(decoded);
        expect(again.issues).toEqual([]);
    });

    it('fails only when the data is not user data at all', () => {
        expect(isSuccess(decode(userDataWithUndecodedViews, { views: 'garbage', formatRevision: CURRENT_USERDATA_FORMAT_REVISION }).result)).toBe(true);
        expect(isSuccess(decode(userDataWithUndecodedViews, { views: {} }).result)).toBe(false);
        expect(isSuccess(decode(userDataWithUndecodedViews, []).result)).toBe(false);
    });
});

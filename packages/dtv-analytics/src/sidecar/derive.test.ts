import { CURRENT_USERDATA_FORMAT_REVISION, type UndecodedFilterState, type ViewMigrationChain, type ViewProjection } from '@kronor/dtv';
import { filterUses, isSet, setFilters, userViewData, type Definitions } from './derive.js';

type FormState = UndecodedFilterState[string];

const leaf = { kind: 'leaf', cmp: 'equals', field: 'x', control: { type: 'text' } } as const;

const projection = (revision: number, filters: string[]): ViewProjection => ({
    definition: 'journal-list',
    revision,
    filters: Object.fromEntries(filters.map(id => [id, leaf])),
    columns: {},
}) as unknown as ViewProjection;

// Revision 2 renamed `amt`, dropped `old`, moved `status` to `state` and reset `memo`
const rev1 = projection(1, ['amt', 'old', 'status', 'memo', 'date']);
const rev2 = projection(2, ['amount', 'state', 'memo', 'date']);
const chain: ViewMigrationChain = {
    baseline: rev1,
    latest: rev2,
    migrations: [{
        from: rev1,
        to: rev2,
        ops: [
            { kind: 'renameFilter', from: 'amt', to: 'amount' },
            { kind: 'drop', filterId: 'old' },
            { kind: 'custom', from: 'status', to: 'state', migrate: (state: FormState) => state },
            { kind: 'reset', filterId: 'memo' },
            { kind: 'keep', filterId: 'date', because: 'unchanged' },
        ],
    }],
};

const definitions: Definitions = new Map([['journal-list', chain]]);

const value = (v: string | number): FormState => ({ type: 'leaf', value: { type: 'value', value: v } });
const empty: FormState = { type: 'leaf', value: { type: 'empty' } };

describe('isSet', () => {
    it('is set when a leaf of it holds a value', () => {
        expect(isSet(value(1))).toBe(true);
        expect(isSet(empty)).toBe(false);
        expect(isSet({ type: 'and', children: [empty, value(1)] })).toBe(true);
        expect(isSet({ type: 'or', children: [empty, empty] })).toBe(false);
        expect(isSet({ type: 'not', child: value('x') })).toBe(true);
    });
});

describe('setFilters', () => {
    const state = { amt: value(10), old: value(1), status: value('open'), memo: value('rent'), date: empty } as UndecodedFilterState;

    it('names the filters of an old revision as the current one does', () => {
        expect(setFilters(definitions, 'journal-list', 1, state)).toEqual(expect.arrayContaining([
            { filterId: 'amount', removed: false },
            { filterId: 'state', removed: false },
        ]));
    });

    it('marks a filter dropped since as removed, and leaves out one reset since and an empty one', () => {
        const filters = setFilters(definitions, 'journal-list', 1, state);

        expect(filters).toContainEqual({ filterId: 'old', removed: true });
        expect(filters.map((f: { filterId: string }) => f.filterId)).not.toContain('memo');
        expect(filters.map((f: { filterId: string }) => f.filterId)).not.toContain('date');
    });

    it('reads a state of the current revision as it is', () => {
        expect(setFilters(definitions, 'journal-list', 2, { memo: value('rent') } as UndecodedFilterState))
            .toEqual([{ filterId: 'memo', removed: false }]);
    });

    it('keeps the ids of a definition it does not know', () => {
        expect(setFilters(definitions, 'unknown-list', 3, { a: value(1), b: empty } as UndecodedFilterState))
            .toEqual([{ filterId: 'a', removed: false }]);
    });
});

describe('filterUses', () => {
    it('gives a row per filter set in each application', () => {
        expect(filterUses(definitions, [
            { eventId: '7', definition: 'journal-list', definitionRevision: 2, filters: { amount: value(1), date: value('2026-11-01') } as UndecodedFilterState },
            { eventId: '8', definition: 'journal-list', definitionRevision: 2, filters: {} },
        ])).toEqual([
            { eventId: '7', filterId: 'amount', removed: false },
            { eventId: '7', filterId: 'date', removed: false },
        ]);
    });
});

describe('userViewData', () => {
    const view = {
        columnOrder: null,
        hiddenColumns: ['memo'],
        rowsPerPage: 50,
        syncOrderingToUserData: true,
        ordering: { field: 'date', direction: 'DESC' },
        syncFilterStateToUserData: true,
        persistedFilterState: { amt: value(10) },
        savedFilters: [{ id: 's1', name: 'Big ones', view: 'journal-list-7', createdAt: '2026-10-01T00:00:00.000Z', formatRevision: '2026-03-26T00:00:00.000Z', state: { amt: value(1000), old: value(1) } }],
        definitionRevision: 1,
    };

    it('reads each view of a user, at the current revision of its definition', () => {
        const result = userViewData(definitions, { 'journal-list-7': 'journal-list' }, [
            { userId: '881', revision: '3', data: { views: { 'journal-list-7': view }, revision: 3, formatRevision: CURRENT_USERDATA_FORMAT_REVISION } },
        ]);

        expect(result.unreadable).toEqual([]);
        expect(result.views).toEqual([expect.objectContaining({
            userId: '881',
            viewId: 'journal-list-7',
            definition: 'journal-list',
            hiddenColumns: ['memo'],
            keepsFilters: true,
            keptFilters: ['amount'],
            savedFilters: [{ id: 's1', name: 'Big ones', createdAt: '2026-10-01T00:00:00.000Z', filters: ['amount'] }],
        })]);
    });

    it('says which users\' data it cannot read', () => {
        const result = userViewData(definitions, {}, [{ userId: '5', revision: '0', data: 'not an object' }]);

        expect(result.views).toEqual([]);
        expect(result.unreadable).toEqual([expect.objectContaining({ userId: '5' })]);
    });
});

/**
 * @jest-environment jsdom
 */

import { decodeViewData, type ViewData } from './user-data';
import { decode } from './decoder';
import { undecodedViewData } from './user-data-undecoded';
import type { FilterGroups } from './filters';
import * as FilterValue from './filterValue';
import { unwrapResult } from './result';

// The view has gained `merchant` since the stored payload below was written.
const currentSchema: FilterGroups = [
    {
        name: 'default',
        label: null,
        filters: [
            {
                id: 'status',
                label: 'Status',
                expression: { type: 'equals', field: 'status', value: { type: 'text' } },
                aiGenerated: false
            },
            {
                id: 'merchant',
                label: 'Merchant',
                expression: { type: 'equals', field: 'merchant', value: { type: 'text', initialValue: 'acme' } },
                aiGenerated: false
            }
        ]
    }
];

function viewDataWithStoredState(state: Record<string, unknown>): ViewData {
    const stored = unwrapResult(decode(undecodedViewData, {
        columnOrder: null,
        hiddenColumns: [],
        rowsPerPage: null,
        syncFilterStateToUserData: true,
        persistedFilterState: state,
        savedFilters: [
            {
                id: 'sf-1',
                name: 'Filter 1',
                view: 'view-a',
                state,
                createdAt: '2026-01-02T03:04:05.000Z',
                formatRevision: 'rev'
            }
        ]
    }).result);
    return decodeViewData('view-a', stored, currentSchema).viewData;
}

describe('decodeViewData filter-state hydration', () => {
    const storedState = { status: { type: 'leaf', value: { type: 'value', value: 'PAID' } } };

    it('gives a filter the stored state knows nothing about its schema initialValue', () => {
        const persisted = viewDataWithStoredState(storedState).persistedFilterState;
        expect(persisted?.get('status')).toEqual({ type: 'leaf', value: FilterValue.value('PAID') });
        expect(persisted?.get('merchant')).toEqual({ type: 'leaf', value: FilterValue.value('acme') });
    });

    it('leaves saved filters as exact snapshots', () => {
        const savedFilterState = viewDataWithStoredState(storedState).savedFilters[0].state;
        expect(savedFilterState.get('status')).toEqual({ type: 'leaf', value: FilterValue.value('PAID') });
        expect(savedFilterState.get('merchant')).toEqual({ type: 'leaf', value: FilterValue.empty });
    });

    it('hydrates initial values from a fully-cleared stored state', () => {
        // Everything empty serializes to `{}`, which carries no information about any
        // filter, so the schema's initial values apply.
        const persisted = viewDataWithStoredState({}).persistedFilterState;
        expect(persisted?.get('status')).toEqual({ type: 'leaf', value: FilterValue.empty });
        expect(persisted?.get('merchant')).toEqual({ type: 'leaf', value: FilterValue.value('acme') });
    });
});

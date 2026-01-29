/**
 * @jest-environment jsdom
 */

import { defaultUserPreferences, fromUserDataJson, toUserDataJson, type UserData } from './user-data';
import { parseFilterFormState } from './filter-form-state';
import type { FilterSchemasAndGroups } from './filters';

const basicSchema: FilterSchemasAndGroups = {
    groups: [{ name: 'default', label: null }],
    filters: [
        {
            id: 'email-filter',
            label: 'Email Filter',
            expression: {
                type: 'equals',
                field: 'email',
                value: { type: 'text' }
            },
            group: 'default',
            aiGenerated: false
        }
    ]
};

describe('user-data serialization', () => {
    it('roundtrips savedFilters createdAt Date <-> string', () => {
        const filterState = parseFilterFormState({}, basicSchema);

        const data: UserData = {
            preferences: defaultUserPreferences,
            views: {
                'view-a': {
                    columnOrder: ['c1'],
                    hiddenColumns: ['h1'],
                    rowsPerPage: 50,
                    savedFilters: [
                        {
                            id: 'sf-1',
                            name: 'Filter 1',
                            view: 'view-a',
                            state: filterState,
                            createdAt: new Date('2026-01-02T03:04:05.000Z'),
                            formatRevision: 'rev'
                        }
                    ]
                }
            },
            revision: 0,
            formatRevision: 'rev-user'
        };

        const json = toUserDataJson(data);
        expect(typeof json.views['view-a'].savedFilters[0].createdAt).toBe('string');
        expect(json.views['view-a'].savedFilters[0].createdAt).toBe('2026-01-02T03:04:05.000Z');

        const roundtripped = fromUserDataJson(json, { 'view-a': basicSchema });
        const createdAt = roundtripped.views['view-a'].savedFilters[0].createdAt;
        expect(createdAt instanceof Date).toBe(true);
        expect(createdAt.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    });
});

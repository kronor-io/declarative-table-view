import { describe, it, expect } from '@jest/globals';
import { view } from './view';
import { filterSchema, group } from './filters';
import { column, valueQuery } from './columns';

describe('dsl/view', () => {
    it('is identity for View', () => {
        const input = {
            title: 'My View',
            id: 'my-view',
            collectionName: 'things',
            paginationKey: 'createdAt',
            boolExpType: 'ThingBoolExp',
            orderByType: '[ThingOrderBy!]',
            columnDefinitions: [
                column({ id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
            ],
            filterSchema: filterSchema([group('default', null)], []),
        };

        expect(view(input)).toBe(input);
    });
});

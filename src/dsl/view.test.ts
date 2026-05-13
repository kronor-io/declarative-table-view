import { describe, it, expect } from '@jest/globals';
import { view } from './view';
import type { View } from './view';
import { filter, filterGroup } from './filters';
import { column, valueQuery } from './columns';
import { FilterExpr } from './filterExpr';
import { FilterControl } from './filterControl';

describe('dsl/view', () => {
    it('is identity for View', () => {
        const input: View = {
            title: 'My View',
            id: 'my-view',
            source: { type: 'collection', collectionName: 'things' },
            paginationKey: 'createdAt',
            boolExpType: 'ThingBoolExp',
            orderByType: '[ThingOrderBy!]',
            columnDefinitions: [
                column({ id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
            ],
            filterGroups: [filterGroup({ name: 'default', label: null, filters: [] })],
        };

        expect(view(input)).toBe(input);
    });

    it('accepts a function-backed view', () => {
        const input: View = {
            title: 'My Function View',
            id: 'my-function-view',
            source: { type: 'function', functionName: 'searchThings', args: { tenantId: 'tenant-123' } },
            paginationKey: 'createdAt',
            boolExpType: 'ThingBoolExp',
            orderByType: '[ThingOrderBy!]',
            columnDefinitions: [
                column({ id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
            ],
            filterGroups: [filterGroup({ name: 'default', label: null, filters: [] })],
        };

        expect(view(input)).toBe(input);
    });

    it('throws when columnDefinitions has duplicate ids', () => {
        const input: View = {
            title: 'My View',
            id: 'my-view',
            source: { type: 'collection', collectionName: 'things' },
            paginationKey: 'createdAt',
            boolExpType: 'ThingBoolExp',
            orderByType: '[ThingOrderBy!]',
            columnDefinitions: [
                column({ id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
                column({ id: 'id', name: 'ID2', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
            ],
            filterGroups: [filterGroup({ name: 'default', label: null, filters: [] })],
        };

        expect(() => view(input)).toThrow('Duplicate id "id"');
    });

    it('throws when filters across groups have duplicate ids', () => {
        const f1 = filter({
            id: 'same',
            label: 'Same',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });
        const f2 = filter({
            id: 'same',
            label: 'Same again',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });

        const input: View = {
            title: 'My View',
            id: 'my-view',
            source: { type: 'collection', collectionName: 'things' },
            paginationKey: 'createdAt',
            boolExpType: 'ThingBoolExp',
            orderByType: '[ThingOrderBy!]',
            columnDefinitions: [
                column({ id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null }),
            ],
            filterGroups: [
                filterGroup({ name: 'g1', label: null, filters: [f1] }),
                filterGroup({ name: 'g2', label: null, filters: [f2] }),
            ],
        };

        expect(() => view(input)).toThrow('Duplicate id "same"');
    });
});

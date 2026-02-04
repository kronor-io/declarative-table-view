import { describe, it, expect } from '@jest/globals';
import { filter, filterField, filterSchema, group } from './filters';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';

describe('dsl/filters', () => {
    it('builds FilterField helpers', () => {
        expect(filterField.and('a', 'b')).toEqual({ and: ['a', 'b'] });
        expect(filterField.or('a', 'b')).toEqual({ or: ['a', 'b'] });
    });

    it('defaults aiGenerated to false', () => {
        const f = filter({
            id: 'id',
            label: 'Label',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
            group: 'default'
        });
        expect(f.aiGenerated).toBe(false);
    });

    it('builds schema with groups and filters', () => {
        const g = group('default', null);
        const f = filter({
            id: 'id',
            label: 'Label',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() }),
            group: 'default'
        });
        const s = filterSchema([g], [f]);
        expect(s.groups).toHaveLength(1);
        expect(s.filters).toHaveLength(1);
        expect(s.groups[0]).toEqual({ name: 'default', label: null });
        expect(s.filters[0].id).toBe('id');
    });
});

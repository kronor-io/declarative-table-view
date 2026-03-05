import { describe, it, expect } from '@jest/globals';
import { filter, filterField, filterGroups, group } from './filters';
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
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });
        expect(f.aiGenerated).toBe(false);
    });

    it('builds filterGroups with nested filters', () => {
        const f = filter({
            id: 'id',
            label: 'Label',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });
        const g = group('default', null, [f]);
        const s = filterGroups(g);
        expect(s).toHaveLength(1);
        expect(s[0]).toEqual({ name: 'default', label: null, filters: [f] });
    });
});

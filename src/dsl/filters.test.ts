import { describe, it, expect } from '@jest/globals';
import { filter, filterField, filterGroup } from './filters';
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

    it('builds filter group arrays with nested filters', () => {
        const f = filter({
            id: 'id',
            label: 'Label',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });
        const g = filterGroup({ name: 'default', label: null, filters: [f] });
        const s = [g];
        expect(s).toHaveLength(1);
        expect(s[0]).toEqual({ name: 'default', label: null, filters: [f] });
    });
});

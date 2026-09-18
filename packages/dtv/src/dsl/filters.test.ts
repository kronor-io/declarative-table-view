import { describe, it, expect } from '@jest/globals';
import { rowType } from './columns';
import { filter, filterField, filterGroup } from './filters';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { TransformResult } from '../framework/filters';
import { Hasura } from '../framework/graphql';

const Row = rowType<{ name: string; amount: number }>();

describe('dsl/filters', () => {
    it('builds FilterField helpers', () => {
        expect(filterField.and('a', 'b')).toEqual({ and: ['a', 'b'] });
        expect(filterField.or('a', 'b')).toEqual({ or: ['a', 'b'] });
    });

    it('defaults aiGenerated to false', () => {
        const f = filter({
            rowType: Row,
            id: 'id',
            label: 'Label',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });
        expect(f.aiGenerated).toBe(false);
    });

    it('builds filter group arrays with nested filters', () => {
        const f = filter({
            rowType: Row,
            id: 'id',
            label: 'Label',
            expression: FilterExpr.equals({ field: 'name', control: FilterControl.text() })
        });
        const g = filterGroup({ name: 'default', label: null, filters: [f] });
        const s = [g];
        expect(s).toHaveLength(1);
        expect(s[0]).toEqual({ name: 'default', label: null, filters: [f] });
    });

    it('omits transform from a leaf that was given none', () => {
        expect(FilterExpr.equals({ field: 'name', control: FilterControl.text() }))
            .toEqual({ type: 'equals', field: 'name', value: { type: 'text' } });
    });

    it('builds a range as a pair of bounded leaves', () => {
        expect(FilterExpr.range({ field: 'amount', control: FilterControl.number })).toEqual({
            type: 'and',
            filters: [
                { type: 'greaterThanOrEqual', field: 'amount', value: { type: 'number', placeholder: 'from' } },
                { type: 'lessThanOrEqual', field: 'amount', value: { type: 'number', placeholder: 'to' } }
            ]
        });
    });

    it('passes a range transform to both bounds', () => {
        const transform = { toQuery: (input: unknown) => TransformResult.value(input) };
        const range = FilterExpr.range({ field: 'amount', control: FilterControl.number, transform });
        expect(range.filters.map(bound => bound.transform)).toEqual([transform, transform]);
    });

    it('carries a fieldLabel when one is given, and omits it otherwise', () => {
        expect(FilterExpr.equals({ field: 'subsidiaryId', control: FilterControl.text(), fieldLabel: 'Subsidiary' }))
            .toEqual({ type: 'equals', field: 'subsidiaryId', value: { type: 'text' }, fieldLabel: 'Subsidiary' });

        expect('fieldLabel' in FilterExpr.equals({ field: 'subsidiaryId', control: FilterControl.text() })).toBe(false);
    });

    it('gives both range bounds the same fieldLabel', () => {
        const range = FilterExpr.range({ field: 'amount', control: FilterControl.number, fieldLabel: 'Amount' });
        expect(range.filters.map(bound => bound.fieldLabel)).toEqual(['Amount', 'Amount']);
    });

    it('labels a computedCondition, whose field never reaches the query', () => {
        const computed = FilterExpr.computedCondition({
            control: FilterControl.text(),
            fieldLabel: 'Consumption progress',
            transform: { toQuery: () => TransformResult.condition(Hasura.empty()) }
        });
        expect(computed).toEqual({
            type: 'equals',
            field: { or: [] },
            value: { type: 'text' },
            fieldLabel: 'Consumption progress',
            transform: expect.any(Object)
        });
    });
});

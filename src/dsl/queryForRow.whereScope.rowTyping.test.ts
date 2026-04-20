import { describe, it, expect } from '@jest/globals';
import { queryForRowType } from './queryForRow';

// Type-level regression test: `queryForRowType<Row>().array(..., { where })`
// should type the `where` callback against the array element row type.

describe('dsl/queryForRow where scoping typing', () => {
    it('types where callback to array element row', () => {
        type Row = {
            id: string;
            lines: Array<{
                item: {
                    sku: string;
                    qty: number | null;
                };
            }>;
        };

        const q = queryForRowType<Row>();

        q.array({
            field: 'lines',
            selectionSet: line => [
                line.object({
                    field: 'item',
                    selectionSet: item => [
                        item.value({ field: 'sku' }),
                        item.value({ field: 'qty' }),
                    ]
                })
            ],
            where: Line =>
                Line.and(
                    Line.condition('item.sku', Line.ilike('%SKU%')),
                    Line.condition('item.qty', Line.gt(1))
                )
        });

        q.array({
            field: 'lines',
            selectionSet: _line => {
                void _line;
                return [];
            },
            where: Line =>
                // @ts-expect-error should not allow outer-row field paths inside element where
                Line.condition('id', Line.eq('abc'))
        });

        expect(true).toBe(true);
    });
});

import { flattenColumnFields } from './data';
import type { ColumnDefinition, FieldQuery } from './column-definition';
import { objectQuery, valueQuery, arrayQuery } from '../dsl/columns';

describe('flattenColumnFields mixed query types', () => {
    it('returns object containing only queried root fields for mixed query types', () => {
        const row = {
            user: { id: 1, profile: { email: 'a@example.com' } },
            orders: [
                { total: 100, product: { name: 'Widget' } },
                { total: 200, product: { name: 'Gizmo' } }
            ]
        };

        const queries: FieldQuery[] = [
            objectQuery('user', [
                valueQuery('id'),
                objectQuery('profile', [valueQuery('email')])
            ]),
            arrayQuery('orders', [
                valueQuery('total'),
                objectQuery('product', [valueQuery('name')])
            ])
        ];

        const col: ColumnDefinition = { type: 'virtualColumn', id: 'mixed-queries', data: queries };
        const result = flattenColumnFields(row, col);
        // Should not be the same reference (per-column shaping)
        expect(result).not.toBe(row);
        // Only user & orders root fields present
        expect(Object.keys(result).sort()).toEqual(['orders', 'user']);
        expect(result.user.id).toBe(1);
        expect(result.user.profile.email).toBe('a@example.com');
        expect(result.orders.map((o: any) => o.total)).toEqual([100, 200]);
        expect(result.orders.map((o: any) => o.product.name)).toEqual(['Widget', 'Gizmo']);
    });
});

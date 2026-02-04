import { describe, it, expect } from '@jest/globals';
import { arrayQuery, column } from '../dsl/columns';
import { generateSelectionSetFromColumns, generateGraphQLQuery } from './graphql';

describe('GraphQL distinct_on support', () => {
    it('carries distinct_on in selection set for arrayQuery', () => {
        const col = column({
            id: 'items-col',
            name: 'Items',
            data: [
                arrayQuery({
                    field: 'items',
                    selectionSet: [
                        { type: 'valueQuery', field: 'label' } as any
                    ],
                    distinctOn: ['user_id', 'created_at'],
                    limit: 10
                })
            ],
            cellRenderer: () => null
        });

        const selection = generateSelectionSetFromColumns([col]);
        expect(selection[0].field).toBe('items');
        expect(selection[0].distinct_on).toEqual(['user_id', 'created_at']);
        expect(selection[0].limit).toBe(10);
    });

    it('renders distinct_on in nested field args', () => {
        const col = column({
            id: 'items-col',
            name: 'Items',
            data: [
                arrayQuery({
                    field: 'items',
                    selectionSet: [
                        { type: 'valueQuery', field: 'label' } as any
                    ],
                    distinctOn: ['user_id', 'created_at'],
                    limit: 5
                })
            ],
            cellRenderer: () => null
        });

        const query = generateGraphQLQuery('payments', [col], 'payments_bool_exp', 'payments_order_by', 'id');
        const pattern = /items\((?:distinctOn: \[user_id, created_at\], limit: 5|limit: 5, distinctOn: \[user_id, created_at\])\) \{/;
        expect(pattern.test(query)).toBe(true);
    });
});

/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { buildSchema } from 'graphql';
import { describeUnorderableColumns, findUnorderableColumns, orderByTypeOf } from './orderingCheck';

const schema = buildSchema(`
    scalar json
    scalar jsonb
    type Query { users: [User!]! }
    type User {
        id: ID!
        realname: String
        roles: jsonb
        settings: json
        limit: Limit
        businessUnits: [BusinessUnit!]!
    }
    type Limit { amount: Int  rules: jsonb }
    type BusinessUnit { name: String }
`);

describe('cli/typegen/orderingCheck', () => {
    it('follows a dotted path through object fields to the type it ends in', () => {
        expect(orderByTypeOf(schema, 'User', 'realname')?.name).toBe('String');
        expect(orderByTypeOf(schema, 'User', 'limit.amount')?.name).toBe('Int');
        expect(orderByTypeOf(schema, 'User', 'limit.rules')?.name).toBe('jsonb');
    });

    it('resolves nothing for a path the schema does not have', () => {
        expect(orderByTypeOf(schema, 'User', 'missing')).toBeNull();
        expect(orderByTypeOf(schema, 'User', 'realname.length')).toBeNull();
        expect(orderByTypeOf(schema, 'Missing', 'id')).toBeNull();
    });

    it('finds the columns sorted by a json or jsonb field, nested ones included', () => {
        expect(findUnorderableColumns(schema, [{
            viewId: 'user-list',
            rowTypeName: 'User',
            columns: {
                realname: { orderBy: 'realname' },
                roles: { orderBy: 'roles' },
                settings: { orderBy: 'settings' },
                limitRules: { orderBy: 'limit.rules' },
                limitAmount: { orderBy: 'limit.amount' },
                businessUnits: { orderBy: null },
                gone: { orderBy: 'missing' }
            }
        }])).toEqual([
            { viewId: 'user-list', columnId: 'roles', orderBy: 'roles', scalar: 'jsonb' },
            { viewId: 'user-list', columnId: 'settings', orderBy: 'settings', scalar: 'json' },
            { viewId: 'user-list', columnId: 'limitRules', orderBy: 'limit.rules', scalar: 'jsonb' }
        ]);
    });

    it('names each column and the way out', () => {
        const message = describeUnorderableColumns([{ viewId: 'user-list', columnId: 'roles', orderBy: 'roles', scalar: 'jsonb' }]);

        expect(message).toContain('- user-list: column "roles" sorts by "roles" (jsonb)');
        expect(message).toContain('Orderable.notOrderable');
    });
});

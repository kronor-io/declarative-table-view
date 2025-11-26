import { flattenFields } from './data';
import { ColumnDefinition, fieldAlias } from './column-definition';
import { valueQuery, objectQuery, arrayQuery } from '../dsl/columns';

describe('flattenFields', () => {
    it('creates per-column cell objects for simple fields', () => {
        const rows = [
            { id: 1, name: 'Alice', age: 30 },
            { id: 2, name: 'Bob', age: 25 }
        ];
        const columns: ColumnDefinition[] = [
            { data: [valueQuery('id')] } as ColumnDefinition,
            { data: [valueQuery('name')] } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result.length).toBe(2);
        expect(result[0].length).toBe(2);
        expect(result[0][0]).toEqual({ id: 1 });
        expect(result[0][1]).toEqual({ name: 'Alice' });
        expect(result[1][0]).toEqual({ id: 2 });
        expect(result[1][1]).toEqual({ name: 'Bob' });
    });

    it('includes nested root object for nested field paths', () => {
        const rows = [
            { id: 1, user: { profile: { email: 'alice@example.com' } } },
            { id: 2, user: { profile: { email: 'bob@example.com' } } }
        ];
        const columns: ColumnDefinition[] = [
            { data: [objectQuery('user', [objectQuery('profile', [valueQuery('email')])])] } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result.length).toBe(2);
        expect(result[0][0]).toEqual({ user: rows[0].user });
        expect(result[1][0]).toEqual({ user: rows[1].user });
        expect((result[0][0] as any).user.profile.email).toBe('alice@example.com');
        expect((result[1][0] as any).user.profile.email).toBe('bob@example.com');
    });

    it('copies root array for multiple nested field paths with array parent', () => {
        const rows = [
            {
                id: 1,
                users: [
                    { profile: { email: 'alice@example.com', age: 30 } },
                    { profile: { email: 'bob@example.com', age: 25 } }
                ]
            },
            {
                id: 2,
                users: [
                    { profile: { email: 'carol@example.com', age: 28 } }
                ]
            }
        ];
        const columns: ColumnDefinition[] = [
            {
                data: [
                    arrayQuery('users', [objectQuery('profile', [valueQuery('email')])]),
                    arrayQuery('users', [objectQuery('profile', [valueQuery('age')])])
                ]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result.length).toBe(2);
        expect(result[0][0]).toEqual({ users: rows[0].users });
        expect(result[1][0]).toEqual({ users: rows[1].users });
        expect((result[0][0] as any).users.length).toBe(2);
        expect((result[1][0] as any).users.length).toBe(1);
    });

    it('includes alias field only for simple alias', () => {
        // Simulate the response that would come from GraphQL with aliases
        const rows = [
            {
                id: 1,
                user: { name: 'Alice' },
                userName: 'Alice' // This is what GraphQL would return for the alias
            },
            {
                id: 2,
                user: { name: 'Bob' },
                userName: 'Bob' // This is what GraphQL would return for the alias
            }
        ];
        const columns: ColumnDefinition[] = [
            {
                data: [fieldAlias("userName", objectQuery("user", [valueQuery("name")]))]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result[0][0]).toEqual({ userName: 'Alice' });
        expect(result[1][0]).toEqual({ userName: 'Bob' });
    });

    it('includes alias field for arrayQuery alias', () => {
        // Simulate the response that would come from GraphQL with aliases for nested arrayQuery
        const rows = [
            {
                id: 1,
                posts: [
                    { title: 'Post 1', created_at: '2023-01-01' },
                    { title: 'Post 2', created_at: '2023-01-02' }
                ],
                recentPostTitles: [ // This is what GraphQL would return for the alias
                    'Post 2',
                    'Post 1'
                ]
            }
        ];
        const columns: ColumnDefinition[] = [
            {
                data: [
                    fieldAlias("recentPostTitles", arrayQuery("posts", [valueQuery("title")]))
                ]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result[0][0]).toEqual({ recentPostTitles: ['Post 2', 'Post 1'] });
    });

    it('includes only outermost alias for nested alias hierarchy', () => {
        // Test aliasing a field alias (though this is a rare case, it should be supported)
        const rows = [
            {
                id: 1,
                user: { name: 'Alice' },
                userName: 'Alice', // This would be the first alias from GraphQL
                displayName: 'Alice' // This would be the second alias from GraphQL
            }
        ];
        const columns: ColumnDefinition[] = [
            {
                data: [
                    fieldAlias("displayName", fieldAlias("userName", objectQuery("user", [valueQuery("name")])))
                ]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result[0][0]).toEqual({ displayName: 'Alice' });
        expect((result[0][0] as any).userName).toBeUndefined();
    });
});

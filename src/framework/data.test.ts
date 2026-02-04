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
            { type: 'tableColumn', id: 'id', name: 'id', data: [valueQuery({ field: 'id' })], cellRenderer: (() => null) as any } as ColumnDefinition,
            { type: 'tableColumn', id: 'name', name: 'name', data: [valueQuery({ field: 'name' })], cellRenderer: (() => null) as any } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result.length).toBe(2);
        expect(result[0].id).toEqual({ id: 1 });
        expect(result[0].name).toEqual({ name: 'Alice' });
        expect(result[1].id).toEqual({ id: 2 });
        expect(result[1].name).toEqual({ name: 'Bob' });
    });

    it('includes nested root object for nested field paths', () => {
        const rows = [
            { id: 1, user: { profile: { email: 'alice@example.com' } } },
            { id: 2, user: { profile: { email: 'bob@example.com' } } }
        ];
        const columns: ColumnDefinition[] = [
            {
                type: 'tableColumn',
                id: 'user',
                name: 'user',
                data: [
                    objectQuery({
                        field: 'user',
                        selectionSet: [
                            objectQuery({
                                field: 'profile',
                                selectionSet: [valueQuery({ field: 'email' })]
                            })
                        ]
                    })
                ],
                cellRenderer: (() => null) as any
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result.length).toBe(2);
        expect(result[0].user).toEqual({ user: rows[0].user });
        expect(result[1].user).toEqual({ user: rows[1].user });
        expect((result[0].user as any).user.profile.email).toBe('alice@example.com');
        expect((result[1].user as any).user.profile.email).toBe('bob@example.com');
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
                type: 'tableColumn',
                id: 'users',
                name: 'users',
                data: [
                    arrayQuery({
                        field: 'users',
                        selectionSet: [
                            objectQuery({
                                field: 'profile',
                                selectionSet: [valueQuery({ field: 'email' })]
                            })
                        ]
                    }),
                    arrayQuery({
                        field: 'users',
                        selectionSet: [
                            objectQuery({
                                field: 'profile',
                                selectionSet: [valueQuery({ field: 'age' })]
                            })
                        ]
                    })
                ],
                cellRenderer: (() => null) as any
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result.length).toBe(2);
        expect(result[0].users).toEqual({ users: rows[0].users });
        expect(result[1].users).toEqual({ users: rows[1].users });
        expect((result[0].users as any).users.length).toBe(2);
        expect((result[1].users as any).users.length).toBe(1);
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
                type: 'tableColumn',
                id: 'userName',
                name: 'userName',
                data: [fieldAlias("userName", objectQuery({ field: 'user', selectionSet: [valueQuery({ field: 'name' })] }))],
                cellRenderer: (() => null) as any
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result[0].userName).toEqual({ userName: 'Alice' });
        expect(result[1].userName).toEqual({ userName: 'Bob' });
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
                type: 'tableColumn',
                id: 'recentPostTitles',
                name: 'recentPostTitles',
                data: [
                    fieldAlias(
                        "recentPostTitles",
                        arrayQuery({ field: "posts", selectionSet: [valueQuery({ field: "title" })] })
                    )
                ],
                cellRenderer: (() => null) as any
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result[0].recentPostTitles).toEqual({ recentPostTitles: ['Post 2', 'Post 1'] });
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
                type: 'tableColumn',
                id: 'displayName',
                name: 'displayName',
                data: [
                    fieldAlias(
                        "displayName",
                        fieldAlias(
                            "userName",
                            objectQuery({ field: "user", selectionSet: [valueQuery({ field: "name" })] })
                        )
                    )
                ],
                cellRenderer: (() => null) as any
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result[0].displayName).toEqual({ displayName: 'Alice' });
        expect((result[0].displayName as any).userName).toBeUndefined();
    });
});

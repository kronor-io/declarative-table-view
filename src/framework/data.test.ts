import { flattenFields } from './data';
import { ColumnDefinition, fieldAlias, field, queryConfigs } from './column-definition';

describe('flattenFields', () => {
    it('extracts simple fields from rows', () => {
        const rows = [
            { id: 1, name: 'Alice', age: 30 },
            { id: 2, name: 'Bob', age: 25 }
        ];
        const columns: ColumnDefinition[] = [
            { data: [{ type: 'field', path: 'id' }] } as ColumnDefinition,
            { data: [{ type: 'field', path: 'name' }] } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result).toEqual([
            [{ id: 1 }, { name: 'Alice' }],
            [{ id: 2 }, { name: 'Bob' }]
        ]);
    });

    it('handles nested field paths', () => {
        const rows = [
            { id: 1, user: { profile: { email: 'alice@example.com' } } },
            { id: 2, user: { profile: { email: 'bob@example.com' } } }
        ];
        const columns: ColumnDefinition[] = [
            { data: [{ type: 'field', path: 'user.profile.email' }] } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result).toEqual([
            [{ 'user.profile.email': 'alice@example.com' }],
            [{ 'user.profile.email': 'bob@example.com' }]
        ]);
    });

    it('handles multiple nested field paths with array parent', () => {
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
                    { type: 'field', path: 'users.profile.email' },
                    { type: 'field', path: 'users.profile.age' }
                ]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);
        expect(result).toEqual([
            [
                {
                    'users.profile.email': ['alice@example.com', 'bob@example.com'],
                    'users.profile.age': [30, 25]
                }
            ],
            [
                {
                    'users.profile.email': ['carol@example.com'],
                    'users.profile.age': [28]
                }
            ]
        ]);
    });

    it('handles field aliases correctly', () => {
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
                data: [fieldAlias("userName", field("user.name"))]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);

        // The flattened result should use the alias name "userName", not the original path "user.name"
        expect(result).toEqual([
            [{ userName: 'Alice' }],
            [{ userName: 'Bob' }]
        ]);
    });

    it('handles field aliases with queryConfigs correctly', () => {
        // Simulate the response that would come from GraphQL with aliases for nested queryConfigs
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
                    fieldAlias("recentPostTitles", queryConfigs([
                        { field: "posts" },
                        { field: "title" }
                    ]))
                ]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);

        // The flattened result should use the alias name "recentPostTitles", not the generated path "posts.title"
        expect(result).toEqual([
            [{
                recentPostTitles: [
                    'Post 2',
                    'Post 1'
                ]
            }]
        ]);
    });

    it('handles nested field aliases correctly', () => {
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
                    fieldAlias("displayName", fieldAlias("userName", field("user.name")))
                ]
            } as ColumnDefinition
        ];
        const result = flattenFields(rows, columns);

        // The flattened result should use the outermost alias name "displayName"
        expect(result).toEqual([
            [{ displayName: 'Alice' }]
        ]);
    });
});

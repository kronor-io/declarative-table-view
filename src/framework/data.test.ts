import { flattenFields } from './data';
import { ColumnDefinition } from './column-definition';

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
            [ { id: 1 }, { name: 'Alice' } ],
            [ { id: 2 }, { name: 'Bob' } ]
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
            [ { 'user.profile.email': 'alice@example.com' } ],
            [ { 'user.profile.email': 'bob@example.com' } ]
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
});

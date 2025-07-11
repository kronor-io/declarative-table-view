import { renderGraphQLQuery, GraphQLQueryAST, generateGraphQLQueryAST, buildHasuraConditions } from "./graphql";
import { ColumnDefinition } from "./column-definition";
import { FilterFormState } from '../components/FilterForm';

describe("renderGraphQLQuery", () => {
    it("renders a simple query with variables and selection set", () => {
        const ast: GraphQLQueryAST = {
            operation: "query",
            name: "GetUsers",
            variables: [
                { name: "conditions", type: "UserBoolExp" },
                { name: "limit", type: "Int" }
            ],
            rootField: "users",
            selectionSet: [
                { field: "id" },
                { field: "name" },
                {
                    field: "posts", limit: 5, order_by: [{ createdAt: 'DESC' }], selections: [
                        { field: "title" },
                        { field: "content" }
                    ]
                }
            ]
        };
        const result = renderGraphQLQuery(ast);
        expect(result).toContain("query GetUsers($conditions: UserBoolExp, $limit: Int)");
        expect(result).toContain("users {");
        expect(result).toContain("id");
        expect(result).toContain("name");
        expect(result).toContain("posts(limit: 5, orderBy: [{createdAt: DESC}])");
        expect(result).toContain("title");
        expect(result).toContain("content");
    });

    it("renders a query with Hasura operators in where", () => {
        const ast: GraphQLQueryAST = {
            operation: "query",
            name: "GetUsersWithFilters",
            variables: [
                { name: "conditions", type: "UserBoolExp" },
                { name: "limit", type: "Int" }
            ],
            rootField: "users",
            selectionSet: [
                { field: "id" },
                { field: "name" },
                {
                    field: "posts",
                    where: {
                        _and: [
                            { title: { _ilike: "%graphql%" } },
                            { published: { _eq: true } },
                            { author_id: { _in: [1, 2, 3] } }
                        ]
                    },
                    limit: 10,
                    order_by: [{ createdAt: 'DESC' }],
                    selections: [
                        { field: "title" },
                        { field: "content" }
                    ]
                }
            ]
        };
        const result = renderGraphQLQuery(ast);
        expect(result).toContain("query GetUsersWithFilters($conditions: UserBoolExp, $limit: Int)");
        expect(result).toContain("users {");
        expect(result).toContain("id");
        expect(result).toContain("name");
        expect(result).toContain("posts(where: {_and: [title: {_ilike: \"%graphql%\"}, published: {_eq: true}, author_id: {_in: [1,2,3]}]}, limit: 10, orderBy: [{createdAt: DESC}])");
        expect(result).toContain("title");
        expect(result).toContain("content");
    });
});

describe("generateGraphQLQueryAST", () => {
    it("should convert column definitions to a GraphQLQueryAST", () => {
        const columns: ColumnDefinition[] = [
            {
                name: "ID",
                data: [{ type: "field", path: "id" }],
                cellRenderer: () => null,
            },
            {
                name: "Name",
                data: [{ type: "field", path: "name" }],
                cellRenderer: () => null,
            },
            {
                name: "Posts",
                data: [
                    {
                        type: "queryConfigs",
                        configs: [
                            {
                                field: "posts",
                                limit: 5,
                                orderBy: { key: "createdAt", direction: "DESC" },
                            },
                            {
                                field: "title",
                            },
                        ],
                    },
                ],
                cellRenderer: () => null,
            },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy");

        expect(ast.operation).toBe("query");
        expect(ast.variables).toEqual([
            { name: "conditions", type: "TestBoolExp" },
            { name: "limit", type: "Int" },
            { name: "orderBy", type: "TestOrderBy" },
        ]);
        expect(ast.rootField).toBe("testRoot(where: $conditions, limit: $limit, orderBy: $orderBy)");
        expect(ast.selectionSet).toEqual([
            { field: "id" },
            { field: "name" },
            {
                field: "posts",
                limit: 5,
                order_by: { createdAt: "DESC" },
                selections: [{ field: "title" }],
            },
        ]);
    });

    it("should handle nested fields and merge selection sets", () => {
        const columns: ColumnDefinition[] = [
            { name: "ID", data: [{ type: "field", path: "id" }], cellRenderer: () => null },
            { name: "Author Name", data: [{ type: "field", path: "author.name" }], cellRenderer: () => null },
            { name: "Author ID", data: [{ type: "field", path: "author.id" }], cellRenderer: () => null },
            { name: "First Comment", data: [{ type: "field", path: "comments.0.text" }], cellRenderer: () => null },
            { name: "First Commenter", data: [{ type: "field", path: "comments.0.user.name" }], cellRenderer: () => null },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy");

        expect(ast.selectionSet).toEqual([
            { field: "id" },
            {
                field: "author",
                selections: [
                    { field: "name" },
                    { field: "id" },
                ],
            },
            {
                field: "comments",
                selections: [
                    {
                        field: "0",
                        selections: [
                            { field: "text" },
                            {
                                field: "user",
                                selections: [{ field: "name" }],
                            },
                        ],
                    },
                ],
            },
        ]);
    });
});

describe('buildHasuraConditions', () => {
    it('should return an empty object for no conditions', () => {
        expect(buildHasuraConditions([])).toEqual({});
    });

    it('should handle a single condition', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', key: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({ name: { _eq: 'test' } });
    });

    it('should handle multiple conditions with an implicit AND', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', key: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } },
            { type: 'leaf', key: 'age', filterType: 'greaterThan', value: 20, control: { type: 'number' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            _and: [
                { name: { _eq: 'test' } },
                { age: { _gt: 20 } }
            ]
        });
    });

    it('should handle nested fields', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', key: 'user.name', filterType: 'equals', value: 'test', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            user: { name: { _eq: 'test' } }
        });
    });

    it('should handle deeply nested fields', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', key: 'a.b.c.d', filterType: 'equals', value: 'deep', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            a: { b: { c: { d: { _eq: 'deep' } } } }
        });
    });

    it('should handle explicit AND/OR conditions', () => {
        const formState: FilterFormState[] = [
            {
                type: 'or',
                filterType: 'or',
                children: [
                    { type: 'leaf', key: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } },
                    { type: 'leaf', key: 'name', filterType: 'equals', value: 'another', control: { type: 'text' } }
                ]
            }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            _or: [
                { name: { _eq: 'test' } },
                { name: { _eq: 'another' } }
            ]
        });
    });

    it('should handle NOT conditions', () => {
        const formState: FilterFormState[] = [
            {
                type: 'not',
                filterType: 'not',
                child: { type: 'leaf', key: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }
            }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            _not: { name: { _eq: 'test' } }
        });
    });

    it('should handle complex nested structures', () => {
        const formState: FilterFormState[] = [
            {
                type: 'and',
                filterType: 'and',
                children: [
                    { type: 'leaf', key: 'age', filterType: 'greaterThan', value: 20, control: { type: 'number' } },
                    {
                        type: 'or',
                        filterType: 'or',
                        children: [
                            { type: 'leaf', key: 'user.name', filterType: 'iLike', value: '%test%', control: { type: 'text' } },
                            {
                                type: 'not',
                                filterType: 'not',
                                child: { type: 'leaf', key: 'user.role', filterType: 'equals', value: 'admin', control: { type: 'text' } }
                            }
                        ]
                    }
                ]
            }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            _and: [
                { age: { _gt: 20 } },
                {
                    _or: [
                        { user: { name: { _ilike: '%test%' } } },
                        { _not: { user: { role: { _eq: 'admin' } } } }
                    ]
                }
            ]
        });
    });

    it('should ignore empty or invalid values', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', key: 'name', filterType: 'equals', value: '', control: { type: 'text' } },
            { type: 'leaf', key: 'age', filterType: 'greaterThan', value: undefined, control: { type: 'number' } },
            { type: 'leaf', key: 'tags', filterType: 'in', value: [], control: { type: 'multiselect', items: [] } },
            { type: 'leaf', key: 'valid', filterType: 'equals', value: 'good', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({ valid: { _eq: 'good' } });
    });

    it('should handle custom operators', () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                key: 'custom_field',
                filterType: 'equals', // This is not used for custom operators, but required by the type
                value: { operator: '_custom_op', value: 'some_value' },
                control: { type: 'customOperator', operators: [{ label: 'Custom Op', value: '_custom_op' }], valueControl: { type: 'text' } }
            }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            custom_field: { _custom_op: 'some_value' }
        });
    });

    it('should handle custom operators with nested fields', () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                key: 'user.name',
                filterType: 'equals', // This is not used for custom operators, but required by the type
                value: { operator: '_ilike', value: '%test%' },
                control: { type: 'customOperator', operators: [{ label: 'iLike', value: '_ilike' }], valueControl: { type: 'text' } }
            }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            user: { name: { _ilike: '%test%' } }
        });
    });
});

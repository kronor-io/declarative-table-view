import { renderGraphQLQuery, GraphQLQueryAST, generateGraphQLQueryAST, buildHasuraConditions } from "./graphql";
import { ColumnDefinition, fieldAlias, field, queryConfigs } from "./column-definition";
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

    it("generates GraphQL query with field aliases", () => {
        const columns: ColumnDefinition[] = [
            {
                name: "ID",
                data: [field("id")],
                cellRenderer: () => null,
            },
            {
                name: "Recent Posts",
                data: [
                    fieldAlias(
                        "recentPosts",
                        queryConfigs([
                            {
                                field: "posts",
                                limit: 3,
                                orderBy: { key: "created_at", direction: "DESC" },
                            },
                            {
                                field: "title",
                            },
                        ])
                    ),
                ],
                cellRenderer: () => null,
            },
            {
                name: "User Name",
                data: [fieldAlias("userName", field("user.name"))],
                cellRenderer: () => null,
            },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy");

        expect(ast.selectionSet).toEqual([
            { field: "id" },
            {
                field: "posts",
                alias: "recentPosts",
                limit: 3,
                order_by: { created_at: "DESC" },
                selections: [{ field: "title" }],
            },
            {
                field: "user",
                selections: [
                    {
                        field: "name",
                        alias: "userName"
                    }
                ],
            },
        ]);

        const query = renderGraphQLQuery(ast);
        expect(query).toContain("recentPosts: posts(limit: 3, orderBy: {created_at: DESC})");
        expect(query).toContain("userName: name");
    });

    it("generates GraphQL query with path support for JSON columns", () => {
        const columns: ColumnDefinition[] = [
            {
                name: "ID",
                data: [field("id")],
                cellRenderer: () => null,
            },
            {
                name: "JSON Field Value",
                data: [
                    queryConfigs([
                        {
                            field: "metadata",
                            path: "$.user.preferences.theme",
                        },
                    ])
                ],
                cellRenderer: () => null,
            },
            {
                name: "JSON Array Element",
                data: [
                    fieldAlias(
                        "firstTag",
                        queryConfigs([
                            {
                                field: "tags",
                                path: "$[0]",
                                limit: 1,
                            },
                        ])
                    )
                ],
                cellRenderer: () => null,
            },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy");

        expect(ast.selectionSet).toEqual([
            { field: "id" },
            {
                field: "metadata",
                path: "$.user.preferences.theme",
            },
            {
                field: "tags",
                alias: "firstTag",
                path: "$[0]",
                limit: 1,
            },
        ]);

        const query = renderGraphQLQuery(ast);
        expect(query).toContain('metadata(path: "$.user.preferences.theme")');
        expect(query).toContain('firstTag: tags(limit: 1, path: "$[0]")');
    });
});

describe('buildHasuraConditions', () => {
    it('should return an empty object for no conditions', () => {
        expect(buildHasuraConditions([])).toEqual({});
    });

    it('should handle a single condition', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({ name: { _eq: 'test' } });
    });

    it('should handle multiple conditions with an implicit AND', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } },
            { type: 'leaf', field: 'age', filterType: 'greaterThan', value: 20, control: { type: 'number' } }
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
            { type: 'leaf', field: 'user.name', filterType: 'equals', value: 'test', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({
            user: { name: { _eq: 'test' } }
        });
    });

    it('should handle deeply nested fields', () => {
        const formState: FilterFormState[] = [
            { type: 'leaf', field: 'a.b.c.d', filterType: 'equals', value: 'deep', control: { type: 'text' } }
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
                    { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } },
                    { type: 'leaf', field: 'name', filterType: 'equals', value: 'another', control: { type: 'text' } }
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
                child: { type: 'leaf', field: 'name', filterType: 'equals', value: 'test', control: { type: 'text' } }
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
                    { type: 'leaf', field: 'age', filterType: 'greaterThan', value: 20, control: { type: 'number' } },
                    {
                        type: 'or',
                        filterType: 'or',
                        children: [
                            { type: 'leaf', field: 'user.name', filterType: 'iLike', value: '%test%', control: { type: 'text' } },
                            {
                                type: 'not',
                                filterType: 'not',
                                child: { type: 'leaf', field: 'user.role', filterType: 'equals', value: 'admin', control: { type: 'text' } }
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
            { type: 'leaf', field: 'name', filterType: 'equals', value: '', control: { type: 'text' } },
            { type: 'leaf', field: 'age', filterType: 'greaterThan', value: undefined, control: { type: 'number' } },
            { type: 'leaf', field: 'tags', filterType: 'in', value: [], control: { type: 'multiselect', items: [] } },
            { type: 'leaf', field: 'valid', filterType: 'equals', value: 'good', control: { type: 'text' } }
        ];
        expect(buildHasuraConditions(formState)).toEqual({ valid: { _eq: 'good' } });
    });

    it('should handle custom operators', () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                field: 'custom_field',
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
                field: 'user.name',
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

describe("Multi-field Filter Support", () => {
    it("should handle object format with and", () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                field: { and: ['name', 'title'] },
                filterType: 'equals',
                value: 'test',
                control: { type: 'text' }
            }
        ];

        const result = buildHasuraConditions(formState);

        expect(result).toEqual({
            _and: [
                { name: { _eq: 'test' } },
                { title: { _eq: 'test' } }
            ]
        });
    });

    it("should handle object format with or", () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                field: { or: ['name', 'title'] },
                filterType: 'equals',
                value: 'test',
                control: { type: 'text' }
            }
        ];

        const result = buildHasuraConditions(formState);

        expect(result).toEqual({
            _or: [
                { name: { _eq: 'test' } },
                { title: { _eq: 'test' } }
            ]
        });
    });

    it("should handle nested fields with object format", () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                field: { or: ['user.email', 'user.username'] },
                filterType: 'iLike',
                value: '%john%',
                control: { type: 'text' }
            }
        ];

        const result = buildHasuraConditions(formState);

        expect(result).toEqual({
            _or: [
                { user: { email: { _ilike: '%john%' } } },
                { user: { username: { _ilike: '%john%' } } }
            ]
        });
    });

    it("should handle mixed multi-field and single field expressions", () => {
        const formState: FilterFormState[] = [
            {
                type: 'leaf',
                field: { or: ['name', 'title'] },
                filterType: 'iLike',
                value: '%search%',
                control: { type: 'text' }
            },
            {
                type: 'leaf',
                field: 'category',
                filterType: 'equals',
                value: 'tech',
                control: { type: 'text' }
            }
        ];

        const result = buildHasuraConditions(formState);

        expect(result).toEqual({
            _and: [
                {
                    _or: [
                        { name: { _ilike: '%search%' } },
                        { title: { _ilike: '%search%' } }
                    ]
                },
                { category: { _eq: 'tech' } }
            ]
        });
    });
});

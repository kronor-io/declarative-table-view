import {
    renderGraphQLQuery,
    GraphQLQueryAST,
    generateGraphQLQueryAST,
    generateSelectionSetFromColumns,
    Hasura,
} from "./graphql";
import {
    generateColumnAliasedGraphQLQuery,
    generateColumnAliasedGraphQLQueryAST,
    generateColumnAliasedSelectionSetFromColumns,
} from "./graphql/query";
import { ColumnDefinition, fieldAlias } from "./column-definition";
import { valueQuery, objectQuery, arrayQuery } from "../dsl/columns";

describe("renderGraphQLQuery", () => {
    it("renders a simple query with variables and selection set", () => {
        const ast: GraphQLQueryAST = {
            operation: "query",
            name: "GetUsers",
            variables: [
                { name: "conditions", type: "UserBoolExp" },
                { name: "rowLimit", type: "Int" }
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
        expect(result).toContain("query GetUsers($conditions: UserBoolExp, $rowLimit: Int)");
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
                { name: "rowLimit", type: "Int" }
            ],
            rootField: "users",
            selectionSet: [
                { field: "id" },
                { field: "name" },
                {
                    field: "posts",
                    where: Hasura.and(
                        Hasura.condition('title', Hasura.ilike('%graphql%')),
                        Hasura.condition('published', Hasura.eq(true)),
                        Hasura.condition('author_id', Hasura.in([1, 2, 3]))
                    ),
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
        expect(result).toContain("query GetUsersWithFilters($conditions: UserBoolExp, $rowLimit: Int)");
        expect(result).toContain("users {");
        expect(result).toContain("id");
        expect(result).toContain("name");
        expect(result).toContain("posts(where: {_and: [{title: {_ilike: \"%graphql%\"}}, {published: {_eq: true}}, {author_id: {_in: [1, 2, 3]}}]}, limit: 10, orderBy: [{createdAt: DESC}])");
        expect(result).toContain("title");
        expect(result).toContain("content");
    });

    it("renders Hasura isNull as _isNull in GraphQL output", () => {
        const ast: GraphQLQueryAST = {
            operation: "query",
            name: "GetUsersWithNullFilter",
            variables: [
                { name: "conditions", type: "UserBoolExp" },
                { name: "rowLimit", type: "Int" }
            ],
            rootField: "users",
            selectionSet: [
                {
                    field: "posts",
                    where: Hasura.condition('deleted_at', Hasura.isNull(true)),
                    selections: [
                        { field: "id" }
                    ]
                }
            ]
        };

        const result = renderGraphQLQuery(ast);

        expect(result).toContain("posts(where: {deleted_at: {_isNull: true}})");
        expect(result).not.toContain("_is_null");
    });
});

describe("generateGraphQLQueryAST", () => {
    it("should convert column definitions to a GraphQLQueryAST", () => {
        const columns: ColumnDefinition[] = [
            { type: 'tableColumn', id: 'id', name: "ID", data: [valueQuery({ field: 'id' })], cellRenderer: () => null },
            { type: 'tableColumn', id: 'name', name: "Name", data: [valueQuery({ field: 'name' })], cellRenderer: () => null },
            { type: 'tableColumn', id: 'posts', name: "Posts", data: [arrayQuery({ field: 'posts', selectionSet: [valueQuery({ field: 'title' })] })], cellRenderer: () => null },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy", "id");

        expect(ast.operation).toBe("query");
        expect(ast.variables).toEqual([
            { name: "conditions", type: "TestBoolExp!" },
            { name: "paginationCondition", type: "TestBoolExp!" },
            { name: "rowLimit", type: "Int" },
            { name: "orderBy", type: "TestOrderBy" },
        ]);
        expect(ast.rootField).toBe("testRoot(where: {_and: [$conditions, $paginationCondition]}, limit: $rowLimit, orderBy: $orderBy)");
        expect(ast.selectionSet).toEqual([
            { field: "id" },
            { field: "name" },
            {
                field: "posts",
                selections: [{ field: "title" }],
            },
        ]);
    });

    it("should handle nested fields with separate selection entries (no merge)", () => {
        const columns: ColumnDefinition[] = [
            { type: 'tableColumn', id: 'id', name: "ID", data: [valueQuery({ field: 'id' })], cellRenderer: () => null },
            { type: 'tableColumn', id: 'authorName', name: "Author Name", data: [objectQuery({ field: 'author', selectionSet: [valueQuery({ field: 'name' })] })], cellRenderer: () => null },
            { type: 'tableColumn', id: 'authorId', name: "Author ID", data: [objectQuery({ field: 'author', selectionSet: [valueQuery({ field: 'id' })] })], cellRenderer: () => null },
            { type: 'tableColumn', id: 'firstComment', name: "First Comment", data: [objectQuery({ field: 'comments', selectionSet: [objectQuery({ field: '0', selectionSet: [valueQuery({ field: 'text' })] })] })], cellRenderer: () => null },
            { type: 'tableColumn', id: 'firstCommenter', name: "First Commenter", data: [objectQuery({ field: 'comments', selectionSet: [objectQuery({ field: '0', selectionSet: [objectQuery({ field: 'user', selectionSet: [valueQuery({ field: 'name' })] })] })] })], cellRenderer: () => null },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy", "id");

        // New behavior: identical parent paths are not merged; entries remain separate unless identical
        expect(ast.selectionSet).toEqual([
            { field: "id" },
            { field: "author", selections: [{ field: "name" }] },
            { field: "author", selections: [{ field: "id" }] },
            { field: "comments", selections: [{ field: "0", selections: [{ field: "text" }] }] },
            { field: "comments", selections: [{ field: "0", selections: [{ field: "user", selections: [{ field: "name" }] }] }] },
        ]);
    });

    it("generates GraphQL query with field aliases", () => {
        const columns: ColumnDefinition[] = [
            {
                type: 'tableColumn',
                id: 'id',
                name: "ID",
                data: [valueQuery({ field: 'id' })],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'recentPosts',
                name: "Recent Posts",
                data: [
                    fieldAlias("recentPosts", arrayQuery({ field: 'posts', selectionSet: [valueQuery({ field: 'title' })] }))
                ],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'userName',
                name: "User Name",
                data: [
                    fieldAlias(
                        "userName",
                        objectQuery({ field: "user", selectionSet: [valueQuery({ field: "name" })] })
                    )
                ],
                cellRenderer: () => null,
            },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy", "id");

        expect(ast.selectionSet).toEqual([
            { field: "id" },
            {
                field: "posts",
                alias: "recentPosts",
                selections: [{ field: "title" }],
            },
            {
                field: "user",
                alias: "userName",
                selections: [
                    {
                        field: "name",
                    }
                ],
            },
        ]);

        const query = renderGraphQLQuery(ast);
        expect(query).toContain("recentPosts: posts");
        expect(query).toContain("userName: user");
    });

    it("generates GraphQL query with path support for JSON columns", () => {
        const columns: ColumnDefinition[] = [
            {
                type: 'tableColumn',
                id: 'id',
                name: "ID",
                data: [valueQuery({ field: "id" })],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'jsonField',
                name: "JSON Field Value",
                data: [
                    valueQuery({ field: 'metadata', path: "$.user.preferences.theme" })
                ],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'jsonArray',
                name: "JSON Array Element",
                data: [
                    fieldAlias(
                        "firstTag",
                        valueQuery({ field: 'tags', path: "$[0]" })
                    )
                ],
                cellRenderer: () => null,
            },
        ];

        const ast = generateGraphQLQueryAST("testRoot", columns, "TestBoolExp", "TestOrderBy", "id");

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
            },
        ]);

        const query = renderGraphQLQuery(ast);
        expect(query).toContain('metadata(path: "$.user.preferences.theme")');
        expect(query).toContain('firstTag: tags(path: "$[0]")');
    });

    it("carries all supported arrayQuery options into the selection set", () => {
        const where = Hasura.and(
            Hasura.condition('status', Hasura.eq('ACTIVE')),
            Hasura.condition('priority', Hasura.gt(5))
        );
        const columns: ColumnDefinition[] = [
            {
                type: 'tableColumn',
                id: 'events',
                name: 'Events',
                data: [
                    arrayQuery({
                        field: 'events',
                        path: '$.recent',
                        orderBy: [
                            { key: 'createdAt', direction: 'DESC' },
                            { key: 'id', direction: 'ASC' }
                        ],
                        distinctOn: ['user_id'],
                        limit: 3,
                        where,
                        selectionSet: [valueQuery({ field: 'type' })]
                    })
                ],
                cellRenderer: () => null,
            }
        ];

        expect(generateSelectionSetFromColumns(columns)).toEqual([
            {
                field: 'events',
                path: '$.recent',
                order_by: [
                    { createdAt: 'DESC' },
                    { id: 'ASC' }
                ],
                distinct_on: ['user_id'],
                limit: 3,
                where,
                selections: [{ field: 'type' }],
            }
        ]);
    });
});

describe("generateColumnAliasedGraphQLQueryAST", () => {
    it("aliases each top-level selection to the column id", () => {
        const columns: ColumnDefinition[] = [
            { type: 'tableColumn', id: 'id', name: 'ID', data: [valueQuery({ field: 'id' })], cellRenderer: () => null },
            {
                type: 'tableColumn',
                id: 'customer-name',
                name: 'Customer Name',
                data: [objectQuery({ field: 'customer', selectionSet: [valueQuery({ field: 'name' })] })],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'latest-posts',
                name: 'Latest Posts',
                data: [fieldAlias('recentPosts', arrayQuery({ field: 'posts', selectionSet: [valueQuery({ field: 'title' })] }))],
                cellRenderer: () => null,
            },
        ];

        expect(generateColumnAliasedSelectionSetFromColumns(columns)).toEqual([
            { field: 'id', alias: 'id' },
            {
                field: 'customer',
                alias: 'customer-name',
                selections: [{ field: 'name' }],
            },
            {
                field: 'posts',
                alias: 'latest-posts',
                selections: [{ field: 'title' }],
            },
        ]);

        const ast = generateColumnAliasedGraphQLQueryAST('testRoot', columns, 'TestBoolExp', 'TestOrderBy', 'id');

        expect(ast.selectionSet).toEqual([
            { field: 'id', alias: 'id' },
            {
                field: 'customer',
                alias: 'customer-name',
                selections: [{ field: 'name' }],
            },
            {
                field: 'posts',
                alias: 'latest-posts',
                selections: [{ field: 'title' }],
            },
        ]);
    });

    it("uses only the first field query for columns with multiple field queries", () => {
        const columns: ColumnDefinition[] = [
            {
                type: 'tableColumn',
                id: 'fullName',
                name: 'Full Name',
                data: [
                    valueQuery({ field: 'firstName' }),
                    valueQuery({ field: 'lastName' }),
                ],
                cellRenderer: () => null,
            },
        ];

        expect(generateColumnAliasedSelectionSetFromColumns(columns)).toEqual([
            { field: 'firstName', alias: 'fullName' },
        ]);
    });

    it("renders the aliased query using only the first field query for each column", () => {
        const columns: ColumnDefinition[] = [
            {
                type: 'tableColumn',
                id: 'fullName',
                name: 'Full Name',
                data: [
                    valueQuery({ field: 'firstName' }),
                    valueQuery({ field: 'lastName' }),
                ],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'posts',
                name: 'Posts',
                data: [arrayQuery({ field: 'posts', selectionSet: [valueQuery({ field: 'title' })] })],
                cellRenderer: () => null,
            },
        ];

        const query = generateColumnAliasedGraphQLQuery('users', columns, 'UserBoolExp', 'UserOrderBy', 'id');

        expect(query).toContain('fullName: firstName');
        expect(query).not.toContain('lastName');
        expect(query).toContain('posts: posts');
        expect(query).toMatch(/\bid\b/);
    });
});

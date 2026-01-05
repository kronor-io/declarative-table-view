import { renderGraphQLQuery, GraphQLQueryAST, generateGraphQLQueryAST } from "./graphql";
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
        expect(result).toContain("query GetUsersWithFilters($conditions: UserBoolExp, $rowLimit: Int)");
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
                type: 'tableColumn',
                id: 'id',
                name: "ID",
                data: [valueQuery("id")],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'name',
                name: "Name",
                data: [valueQuery("name")],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'posts',
                name: "Posts",
                data: [
                    arrayQuery("posts", [valueQuery("title")], undefined)
                ],
                cellRenderer: () => null,
            },
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
            { type: 'tableColumn', id: 'id', name: "ID", data: [valueQuery("id")], cellRenderer: () => null },
            { type: 'tableColumn', id: 'authorName', name: "Author Name", data: [objectQuery("author", [valueQuery("name")])], cellRenderer: () => null },
            { type: 'tableColumn', id: 'authorId', name: "Author ID", data: [objectQuery("author", [valueQuery("id")])], cellRenderer: () => null },
            { type: 'tableColumn', id: 'firstComment', name: "First Comment", data: [objectQuery("comments", [objectQuery("0", [valueQuery("text")])])], cellRenderer: () => null },
            { type: 'tableColumn', id: 'firstCommenter', name: "First Commenter", data: [objectQuery("comments", [objectQuery("0", [objectQuery("user", [valueQuery("name")])])])], cellRenderer: () => null },
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
                data: [valueQuery("id")],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'recentPosts',
                name: "Recent Posts",
                data: [
                    fieldAlias(
                        "recentPosts",
                        arrayQuery("posts", [valueQuery("title")], undefined)
                    ),
                ],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'userName',
                name: "User Name",
                data: [fieldAlias("userName", objectQuery("user", [valueQuery("name")]))],
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
                data: [valueQuery("id")],
                cellRenderer: () => null,
            },
            {
                type: 'tableColumn',
                id: 'jsonField',
                name: "JSON Field Value",
                data: [
                    valueQuery("metadata", { path: "$.user.preferences.theme" })
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
                        valueQuery("tags", { path: "$[0]" })
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
});

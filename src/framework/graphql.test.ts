import { renderGraphQLQuery, GraphQLQueryAST, generateGraphQLQueryAST } from "./graphql";
import { ColumnDefinition } from "./column-definition";

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
                                data: "posts",
                                limit: 5,
                                orderBy: { key: "createdAt", direction: "DESC" },
                            },
                            {
                                data: "title",
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

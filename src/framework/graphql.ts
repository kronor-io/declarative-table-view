import { ColumnDefinition, FieldQuery, OrderByConfig } from './column-definition';
import { HasuraCondition, HasuraOperator, hasuraConditionsAreEqual, unorderedArrayEqual } from './hasura';
export type { HasuraCondition, HasuraOperator } from './hasura';
export { hasuraConditionsAreEqual, hasuraOperatorsAreEqual, buildHasuraConditions } from './hasura';

// Hasura-specific types and helpers moved to ./hasura

// Helper to merge two GraphQLSelectionSets
function mergeSelectionSets(set1: GraphQLSelectionSet, set2: GraphQLSelectionSet): GraphQLSelectionSet {
    const merged = [...set1];

    const selectionsEqual = (a?: GraphQLSelectionSet, b?: GraphQLSelectionSet): boolean => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!selectionItemsEqual(a[i], b[i])) return false;
        }
        return true;
    };

    const orderByEqual = (a?: HasuraOrderBy | HasuraOrderBy[], b?: HasuraOrderBy | HasuraOrderBy[]): boolean => {
        if (a === b) return true;
        if (!a || !b) return false;
        const norm = (v: HasuraOrderBy | HasuraOrderBy[]) => Array.isArray(v) ? v.map(o => JSON.stringify(o)).join('|') : JSON.stringify(v);
        return norm(a) === norm(b);
    };

    const selectionItemsEqual = (a: GraphQLSelectionSetItem, b: GraphQLSelectionSetItem): boolean => {
        return a.field === b.field &&
            a.alias === b.alias &&
            a.path === b.path &&
            a.limit === b.limit &&
            unorderedArrayEqual(a.distinct_on || [], b.distinct_on || [], (x, y) => x === y) &&
            orderByEqual(a.order_by, b.order_by) &&
            ((a.where && b.where) ? hasuraConditionsAreEqual(a.where, b.where) : a.where === b.where) &&
            selectionsEqual(a.selections, b.selections);
    };

    for (const item2 of set2) {
        const duplicate = merged.find(m => selectionItemsEqual(m, item2));
        if (!duplicate) {
            merged.push(item2); // add as-is if not identical
        }
    }
    return merged;
}

export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    // Helper to process new Query types (valueQuery, objectQuery, arrayQuery) recursively
    function processNewQueryTypes(q: any): GraphQLSelectionSetItem | null { // 'any' due to discriminated union runtime checks
        if (q.type === 'valueQuery') {
            const item: GraphQLSelectionSetItem = { field: q.field };
            if (q.path) item.path = q.path;
            return item;
        }
        if (q.type === 'objectQuery') {
            const item: GraphQLSelectionSetItem = { field: q.field };
            if (q.path) item.path = q.path;
            if (Array.isArray(q.selectionSet) && q.selectionSet.length) {
                item.selections = q.selectionSet
                    .map(processNewQueryTypes)
                    .filter((s: GraphQLSelectionSetItem | null): s is GraphQLSelectionSetItem => !!s);
            }
            return item;
        }
        if (q.type === 'arrayQuery') {
            const item: GraphQLSelectionSetItem = { field: q.field };
            if (q.path) item.path = q.path;
            if (q.orderBy) {
                const toHasuraOrderBy = (ob: OrderByConfig | OrderByConfig[]): HasuraOrderBy | HasuraOrderBy[] => {
                    if (Array.isArray(ob)) {
                        return ob.map(o => ({ [o.key]: o.direction.toUpperCase() as 'ASC' | 'DESC' }));
                    }
                    return { [ob.key]: ob.direction.toUpperCase() as 'ASC' | 'DESC' };
                };
                item.order_by = toHasuraOrderBy(q.orderBy);
            }
            if (q.distinctOn) item.distinct_on = q.distinctOn;
            if (q.limit !== undefined) item.limit = q.limit;
            if (q.where) item.where = q.where;
            if (Array.isArray(q.selectionSet) && q.selectionSet.length) {
                item.selections = q.selectionSet
                    .map(processNewQueryTypes)
                    .filter((s: GraphQLSelectionSetItem | null): s is GraphQLSelectionSetItem => !!s);
            }
            return item;
        }
        return null;
    }

    // Helper to process FieldQuery recursively (legacy + new query types)
    function processFieldQuery(fieldQuery: FieldQuery): GraphQLSelectionSetItem | null {
        if (fieldQuery.type === 'fieldAlias') {
            const underlyingItem = processFieldQuery(fieldQuery.field);
            if (underlyingItem) {
                underlyingItem.alias = fieldQuery.alias;
                return underlyingItem;
            }
            return underlyingItem;
        } else if (fieldQuery.type === 'valueQuery' || fieldQuery.type === 'objectQuery' || fieldQuery.type === 'arrayQuery') {
            return processNewQueryTypes(fieldQuery);
        }
        return null;
    }
    // Build selection set for all columns and all FieldQuery[] then apply dedupe-only merge
    const allSelections = columns.flatMap(col => col.data.map(processFieldQuery).filter((item): item is GraphQLSelectionSetItem => !!item));
    return allSelections.reduce((acc: GraphQLSelectionSet, current: GraphQLSelectionSetItem) => mergeSelectionSets(acc, [current]), []);
}

export function generateGraphQLQueryAST(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string
): GraphQLQueryAST {
    const selectionSet = generateSelectionSetFromColumns(columns);
    // Ensure pagination key is present in selection set (append if missing)
    const hasPaginationKey = selectionSet.some(sel => sel.field === paginationKey || sel.alias === paginationKey);
    if (!hasPaginationKey) {
        const buildNested = (path: string): GraphQLSelectionSetItem => {
            const parts = path.split('.');
            const head = parts[0];
            if (parts.length === 1) return { field: head };
            return { field: head, selections: [buildNested(parts.slice(1).join('.'))] };
        };
        selectionSet.push(buildNested(paginationKey));
    }
    return {
        operation: 'query',
        variables: [
            { name: 'conditions', type: `${boolExpType}!` },
            { name: 'paginationCondition', type: `${boolExpType}!` },
            { name: 'rowLimit', type: 'Int' },
            { name: 'orderBy', type: orderByType }
        ],
        // Always compose the final where via an _and that combines user/static conditions with
        // the pagination condition. When there is no active cursor the paginationCondition
        // will simply be an empty object {} which Hasura will treat as a no-op in the boolean expression.
        rootField: `${rootField}(where: {_and: [$conditions, $paginationCondition]}, limit: $rowLimit, orderBy: $orderBy)`,
        selectionSet
    };
}

// Generates a full GraphQL query string for a given root field and schema, supporting only limit (Int), conditions (Hasura condition), and orderBy (Hasura ordering)
// If paginationKey is provided and not already part of the selection set derived from columns,
// it will be appended to ensure cursor-based pagination works even when the user has not defined
// a column for that field.
export function generateGraphQLQuery(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string
): string {
    const ast = generateGraphQLQueryAST(rootField, columns, boolExpType, orderByType, paginationKey);
    return renderGraphQLQuery(ast);
}

// AST-like representation for GraphQL queries
export type GraphQLVariable = {
    name: string;
    type: string;
};

// Hasura order_by type: { field: 'asc' | 'desc' }
export type HasuraOrderBy = Record<string, 'ASC' | 'DESC'>;

export type GraphQLSelectionSetItem = {
    field: string;
    alias?: string; // field alias support
    path?: string; // path for querying inside JSON columns
    where?: HasuraCondition;
    order_by?: HasuraOrderBy | HasuraOrderBy[];
    limit?: number;
    offset?: number;
    distinct_on?: string[];
    selections?: GraphQLSelectionSetItem[];
};

export type GraphQLSelectionSet = GraphQLSelectionSetItem[];

export type GraphQLQueryAST = {
    operation: 'query';
    name?: string;
    variables: GraphQLVariable[];
    rootField: string;
    selectionSet: GraphQLSelectionSet;
};

// Deep equality for HasuraCondition values (order-insensitive for logical arrays like _and/_or)
// Deep equality for HasuraOperator objects
// Equality helpers now imported from ./hasura

// Renders a GraphQLQueryAST to a GraphQL query string
export function renderGraphQLQuery(ast: GraphQLQueryAST): string {
    function renderVariables(vars: GraphQLVariable[]): string {
        if (!vars.length) return '';
        return '('
            + vars.map(v => `$${v.name}: ${v.type}`).join(', ')
            + ')';
    }

    const renderGraphQLLiteral = (value: unknown): string => {
        if (value === null) return 'null';
        if (value === undefined) return 'null';
        if (typeof value === 'string') return JSON.stringify(value);
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) {
            return `[${value.map(renderGraphQLLiteral).join(', ')}]`;
        }
        if (typeof value === 'object') {
            return `{${
                Object.entries(value as Record<string, unknown>)
                    .map(([k, v]) => `${k}: ${renderGraphQLLiteral(v)}`)
                    .join(', ')
            }}`;
        }
        return JSON.stringify(value);
    };

    const renderHasuraOperator = (op: HasuraOperator): string => {
        return `{${
            Object.entries(op)
                .map(([k, v]) => `${k}: ${renderGraphQLLiteral(v)}`)
                .join(', ')
        }}`;
    };

    const renderHasuraOperators = (ops: HasuraOperator[]): string => {
        return `[${ops.map(renderHasuraOperator).join(', ')}]`;
    };

    const isAnd = (cond: HasuraCondition): cond is { _and: HasuraCondition[] } => {
        return typeof cond === 'object' && cond !== null && '_and' in cond && Array.isArray((cond as any)._and);
    };
    const isOr = (cond: HasuraCondition): cond is { _or: HasuraCondition[] } => {
        return typeof cond === 'object' && cond !== null && '_or' in cond && Array.isArray((cond as any)._or);
    };
    const isNot = (cond: HasuraCondition): cond is { _not: HasuraCondition } => {
        return typeof cond === 'object' && cond !== null && '_not' in cond;
    };

    const renderHasuraCondition = (cond: HasuraCondition): string => {
        if (isAnd(cond)) {
            return `{_and: [${cond._and.map(renderHasuraCondition).join(', ')}]}`;
        }
        if (isOr(cond)) {
            return `{_or: [${cond._or.map(renderHasuraCondition).join(', ')}]}`;
        }
        if (isNot(cond)) {
            return `{_not: ${renderHasuraCondition(cond._not)}}`;
        }

        const entries = Object.entries(cond);
        return `{${
            entries
                .map(([field, value]) => {
                    if (Array.isArray(value)) {
                        // Array of HasuraOperator
                        return `${field}: ${renderHasuraOperators(value as HasuraOperator[])}`;
                    }
                    if (typeof value === 'object' && value !== null) {
                        // Heuristic: if the value contains any known operator keys, treat it as HasuraOperator; otherwise treat as nested HasuraCondition.
                        const obj = value as Record<string, unknown>;
                        const keys = Object.keys(obj);
                        const looksLikeOperator = keys.some(k => k.startsWith('_'));
                        return looksLikeOperator
                            ? `${field}: ${renderHasuraOperator(value as HasuraOperator)}`
                            : `${field}: ${renderHasuraCondition(value as HasuraCondition)}`;
                    }
                    return `${field}: ${renderGraphQLLiteral(value)}`;
                })
                .join(', ')
        }}`;
    };

    function renderArgs(item: GraphQLSelectionSetItem): string {
        const args: string[] = [];
        if (item.where) {
            args.push(`where: ${renderHasuraCondition(item.where)}`);
        }
        if (item.limit !== undefined)
            args.push(`limit: ${item.limit}`);
        if (item.path)
            args.push(`path: "${item.path}"`);
        if (item.distinct_on && item.distinct_on.length) {
            const cols = item.distinct_on.map(c => String(c)).join(', ');
            args.push(`distinctOn: [${cols}]`);
        }
        if (item.order_by) {
            // Custom rendering for orderBy to avoid quotes around asc/desc
            const renderOrderBy = (orderBy: HasuraOrderBy | HasuraOrderBy[] | undefined): string => {
                if (Array.isArray(orderBy)) {
                    return (
                        '[' + orderBy.map(renderOrderBy).join(', ') + ']'
                    );
                } else if (typeof orderBy === 'object' && orderBy !== undefined) {
                    return (
                        '{' + Object.entries(orderBy)
                            .map(([k, v]) => `${k}: ${String(v).toUpperCase()}`)
                            .join(', ') + '}'
                    );
                }
                return String(orderBy).toUpperCase();
            };
            args.push(`orderBy: ${renderOrderBy(item.order_by)}`);
        }
        return args.length ? `(${args.join(', ')})` : '';
    }

    function renderSelectionSet(set: GraphQLSelectionSet, indent = '  '): string {
        return set
            .map(item => {
                const args = renderArgs(item);
                const fieldName = item.alias ? `${item.alias}: ${item.field}` : item.field;
                if (item.selections && item.selections.length) {
                    return (
                        `${indent}${fieldName}${args} {` +
                        renderSelectionSet(item.selections, indent + '  ') +
                        `${indent}}`
                    );
                } else {
                    return `${indent}${fieldName}${args}`;
                }
            })
            .join('\n');
    }

    const vars = renderVariables(ast.variables);
    const selection = renderSelectionSet(ast.selectionSet);
    const opName = ast.name ? ` ${ast.name}` : '';
    return (
        `${ast.operation}${opName}${vars} {` +
        `  ${ast.rootField} {` +
        selection +
        `
  }
}`
    );
}

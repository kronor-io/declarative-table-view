import { ColumnDefinition, FieldQuery, OrderByConfig, Query } from '../column-definition';
import {
    hasuraFilterExpressionToObject,
    HasuraFilterExpression,
    hasuraFilterExpressionsAreEqual,
    unorderedArrayEqual,
} from './hasura-filter-expression';
import type { HasuraFilterObject, HasuraOperator } from './hasura-filter-object';

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
            ((a.where && b.where) ? hasuraFilterExpressionsAreEqual(a.where, b.where) : a.where === b.where) &&
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

type SelectionSetFromColumnsOptions = {
    getTopLevelAlias?: (column: ColumnDefinition) => string | undefined;
};

function generateSelectionSetFromColumnsInternal(
    columns: ColumnDefinition[],
    options?: SelectionSetFromColumnsOptions,
): GraphQLSelectionSet {
    const toSelectionSetItem = (query: Query, alias?: string): GraphQLSelectionSetItem => {
        const item: GraphQLSelectionSetItem = { field: query.field };

        if (alias !== undefined) {
            item.alias = alias;
        }

        if (query.path) {
            item.path = query.path;
        }

        return item;
    };

    const toHasuraOrderBy = (orderBy: OrderByConfig | OrderByConfig[]): HasuraOrderBy | HasuraOrderBy[] => {
        if (Array.isArray(orderBy)) {
            return orderBy.map(item => ({ [item.key]: item.direction.toUpperCase() as 'ASC' | 'DESC' }));
        }

        return { [orderBy.key]: orderBy.direction.toUpperCase() as 'ASC' | 'DESC' };
    };

    const processSelectionSet = (selectionSet: readonly Query[]): GraphQLSelectionSet | undefined => {
        if (!selectionSet.length) {
            return undefined;
        }

        return selectionSet.map(query => processNewQueryTypes(query));
    };

    const assertNever = (value: never): never => {
        throw new Error(`Unhandled query type: ${JSON.stringify(value)}`);
    };

    // Helper to process new Query types (valueQuery, objectQuery, arrayQuery) recursively
    function processNewQueryTypes(query: Query, alias?: string): GraphQLSelectionSetItem {
        switch (query.type) {
            case 'valueQuery':
                return toSelectionSetItem(query, alias);
            case 'objectQuery': {
                const item = toSelectionSetItem(query, alias);
                const selections = processSelectionSet(query.selectionSet);

                if (selections) {
                    item.selections = selections;
                }

                return item;
            }
            case 'arrayQuery': {
                const item = toSelectionSetItem(query, alias);

                if (query.orderBy) item.order_by = toHasuraOrderBy(query.orderBy);
                if (query.distinctOn) item.distinct_on = query.distinctOn;
                if (query.limit !== undefined) item.limit = query.limit;
                if (query.where) item.where = query.where;

                const selections = processSelectionSet(query.selectionSet);
                if (selections) {
                    item.selections = selections;
                }

                return item;
            }
            default:
                return assertNever(query);
        }
    }

    // Helper to process FieldQuery recursively (legacy + new query types)
    function processFieldQuery(fieldQuery: FieldQuery, aliasOverride?: string): GraphQLSelectionSetItem {
        switch (fieldQuery.type) {
            case 'fieldAlias':
                return {
                    ...processFieldQuery(fieldQuery.field),
                    alias: aliasOverride ?? fieldQuery.alias,
                };
            case 'valueQuery':
            case 'objectQuery':
            case 'arrayQuery':
                return processNewQueryTypes(fieldQuery, aliasOverride);
            default:
                return assertNever(fieldQuery);
        }
    }

    // Build selection set for all columns and all FieldQuery[] then apply dedupe-only merge
    const allSelections = columns.flatMap(column =>
        (options?.getTopLevelAlias ? column.data.slice(0, 1) : column.data).map(fieldQuery =>
            processFieldQuery(
                fieldQuery,
                options?.getTopLevelAlias?.(column),
            ),
        ),
    );

    return allSelections.reduce((acc: GraphQLSelectionSet, current: GraphQLSelectionSetItem) => mergeSelectionSets(acc, [current]), []);
}

export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns);
}

function getColumnAliasedTopLevelAlias(column: ColumnDefinition): string {
    return column.id;
}

export function generateColumnAliasedSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    return generateSelectionSetFromColumnsInternal(columns, {
        getTopLevelAlias: getColumnAliasedTopLevelAlias,
    });
}

function ensurePaginationKeyInSelectionSet(
    selectionSet: GraphQLSelectionSet,
    paginationKey: string,
): GraphQLSelectionSet {
    const nextSelectionSet = [...selectionSet];

    const hasPaginationKey = nextSelectionSet.some(sel => sel.field === paginationKey || sel.alias === paginationKey);
    if (!hasPaginationKey) {
        const buildNested = (path: string): GraphQLSelectionSetItem => {
            const parts = path.split('.');
            const head = parts[0];
            if (parts.length === 1) return { field: head };
            return { field: head, selections: [buildNested(parts.slice(1).join('.'))] };
        };
        nextSelectionSet.push(buildNested(paginationKey));
    }

    return nextSelectionSet;
}

function buildGraphQLQueryAST(
    rootField: string,
    selectionSet: GraphQLSelectionSet,
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
): GraphQLQueryAST {
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
        selectionSet: ensurePaginationKeyInSelectionSet(selectionSet, paginationKey)
    };
}

export function generateGraphQLQueryAST(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string
): GraphQLQueryAST {
    return buildGraphQLQueryAST(
        rootField,
        generateSelectionSetFromColumns(columns),
        boolExpType,
        orderByType,
        paginationKey,
    );
}

export function generateColumnAliasedGraphQLQueryAST(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
): GraphQLQueryAST {
    return buildGraphQLQueryAST(
        rootField,
        generateColumnAliasedSelectionSetFromColumns(columns),
        boolExpType,
        orderByType,
        paginationKey,
    );
}

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

export function generateColumnAliasedGraphQLQuery(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string,
    paginationKey: string,
): string {
    const ast = generateColumnAliasedGraphQLQueryAST(rootField, columns, boolExpType, orderByType, paginationKey);
    return renderGraphQLQuery(ast);
}

export type GraphQLVariable = {
    name: string;
    type: string;
};

export type HasuraOrderBy = Record<string, 'ASC' | 'DESC'>;

export type GraphQLSelectionSetItem = {
    field: string;
    alias?: string;
    path?: string;
    where?: HasuraFilterExpression;
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

    const isAnd = (cond: HasuraFilterObject): cond is { _and: HasuraFilterObject[] } => {
        return typeof cond === 'object' && cond !== null && '_and' in cond && Array.isArray(cond._and);
    };
    const isOr = (cond: HasuraFilterObject): cond is { _or: HasuraFilterObject[] } => {
        return typeof cond === 'object' && cond !== null && '_or' in cond && Array.isArray(cond._or);
    };
    const isNot = (cond: HasuraFilterObject): cond is { _not: HasuraFilterObject } => {
        return typeof cond === 'object' && cond !== null && '_not' in cond;
    };

    const renderHasuraFilterObject = (cond: HasuraFilterObject): string => {
        if (isAnd(cond)) {
            return `{_and: [${cond._and.map(renderHasuraFilterObject).join(', ')}]}`;
        }
        if (isOr(cond)) {
            return `{_or: [${cond._or.map(renderHasuraFilterObject).join(', ')}]}`;
        }
        if (isNot(cond)) {
            return `{_not: ${renderHasuraFilterObject(cond._not)}}`;
        }

        const entries = Object.entries(cond);
        return `{${
            entries
                .map(([field, value]) => {
                    if (Array.isArray(value)) {
                        const isOperatorObject = (val: unknown): val is HasuraOperator => {
                            if (typeof val !== 'object' || val === null) return false;
                            const keys = Object.keys(val as Record<string, unknown>);
                            if (keys.length === 0) return false;
                            return keys.every(k =>
                                k.startsWith('_') && k !== '_and' && k !== '_or' && k !== '_not'
                            );
                        };

                        const looksLikeOperatorArray = value.every(isOperatorObject);
                        if (looksLikeOperatorArray) {
                            return `${field}: ${renderHasuraOperators(value as HasuraOperator[])}`;
                        }

                        return `${field}: [${(value as HasuraFilterObject[]).map(renderHasuraFilterObject).join(', ')}]`;
                    }
                    if (typeof value === 'object' && value !== null) {
                        const obj = value as Record<string, unknown>;
                        const keys = Object.keys(obj);
                        const looksLikeLogical = keys.includes('_and') || keys.includes('_or') || keys.includes('_not');
                        const looksLikeOperator = !looksLikeLogical && keys.some(k => k.startsWith('_'));
                        return looksLikeOperator
                            ? `${field}: ${renderHasuraOperator(value as HasuraOperator)}`
                            : `${field}: ${renderHasuraFilterObject(value as HasuraFilterObject)}`;
                    }
                    return `${field}: ${renderGraphQLLiteral(value)}`;
                })
                .join(', ')
        }}`;
    };

    function renderArgs(item: GraphQLSelectionSetItem): string {
        const args: string[] = [];
        if (item.where) {
            args.push(`where: ${renderHasuraFilterObject(hasuraFilterExpressionToObject(item.where))}`);
        }
        if (item.limit !== undefined) args.push(`limit: ${item.limit}`);
        if (item.path) args.push(`path: "${item.path}"`);
        if (item.distinct_on && item.distinct_on.length) {
            const cols = item.distinct_on.map(c => String(c)).join(', ');
            args.push(`distinctOn: [${cols}]`);
        }
        if (item.order_by) {
            const renderOrderBy = (orderBy: HasuraOrderBy | HasuraOrderBy[] | undefined): string => {
                if (Array.isArray(orderBy)) {
                    return '[' + orderBy.map(renderOrderBy).join(', ') + ']';
                } else if (typeof orderBy === 'object' && orderBy !== undefined) {
                    return '{' + Object.entries(orderBy)
                        .map(([k, v]) => `${k}: ${String(v).toUpperCase()}`)
                        .join(', ') + '}';
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
                }
                return `${indent}${fieldName}${args}`;
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
        `\n  }\n}`
    );
}

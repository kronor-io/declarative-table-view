// GraphQL document AST and its renderer.
//
// The AST is deliberately small and Hasura-flavoured: a single root field with
// arguments, a nested selection set whose items carry Hasura's collection
// arguments, and a variable list. `renderGraphQLQuery` prints it as a query
// string; variable *values* are built separately by the caller.
import { hasuraFilterExpressionToObject } from '../hasura/filter-expression.js';
import type { HasuraFilterExpression } from '../hasura/filter-expression.js';
import type { HasuraFilterObject, HasuraOperator } from '../hasura/filter-object.js';
import type { OrderDirection } from '../order-direction.js';

export type GraphQLVariable = {
    name: string;
    type: string;
};

export type GraphQLVariableReference = {
    type: 'variable';
    name: string;
};

export type GraphQLArgumentObject = {
    [key: string]: GraphQLArgumentValue;
};

export type GraphQLArgumentValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | GraphQLVariableReference
    | GraphQLArgumentValue[]
    | GraphQLArgumentObject;

export type GraphQLArgument = {
    name: string;
    value: GraphQLArgumentValue;
};

export type GraphQLFieldNode = {
    field: string;
    alias?: string;
    args?: GraphQLArgument[];
};

export type HasuraOrderDirection = OrderDirection;

export type HasuraOrderBy = {
    [key: string]: HasuraOrderDirection | HasuraOrderBy;
};

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
    rootField: GraphQLFieldNode;
    selectionSet: GraphQLSelectionSet;
};

export function renderGraphQLLiteral(value: unknown): string {
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
                .map(([key, entryValue]) => `${key}: ${renderGraphQLLiteral(entryValue)}`)
                .join(', ')
        }}`;
    }

    return JSON.stringify(value);
}

export function graphqlVariableReference(name: string): GraphQLVariableReference {
    return {
        type: 'variable',
        name,
    };
}

export function isGraphQLVariableReference(value: unknown): value is GraphQLVariableReference {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as GraphQLVariableReference).type === 'variable' && typeof (value as GraphQLVariableReference).name === 'string';
}

export function toGraphQLArgumentValue(value: unknown): GraphQLArgumentValue {
    if (isGraphQLVariableReference(value)) {
        return value;
    }

    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(toGraphQLArgumentValue);
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, toGraphQLArgumentValue(entryValue)])
        );
    }

    return String(value);
}

/**
 * Ensures a dotted field path is present in the selection set, adding the
 * missing nesting if it is not. Used to guarantee that fields a caller needs
 * for its own bookkeeping (e.g. a pagination cursor) are always selected.
 */
export function ensureSelectionPath(
    selectionSet: GraphQLSelectionSet,
    fieldPath: string,
): GraphQLSelectionSet {
    const nextSelectionSet = [...selectionSet];
    const path = fieldPath.split('.').filter(Boolean);

    const hasSelectionPath = (set: GraphQLSelectionSet, remainingPath: string[]): boolean => {
        const [head, ...tail] = remainingPath;
        const selection = set.find(sel => sel.field === head || sel.alias === head);
        if (!selection) return false;
        if (tail.length === 0) return true;
        return selection.selections ? hasSelectionPath(selection.selections, tail) : false;
    };

    if (!hasSelectionPath(nextSelectionSet, path)) {
        const buildNested = (path: string): GraphQLSelectionSetItem => {
            const parts = path.split('.');
            const head = parts[0];
            if (parts.length === 1) return { field: head };
            return { field: head, selections: [buildNested(parts.slice(1).join('.'))] };
        };
        nextSelectionSet.push(buildNested(fieldPath));
    }

    return nextSelectionSet;
}

export function renderGraphQLQuery(ast: GraphQLQueryAST): string {
    function renderVariables(vars: GraphQLVariable[]): string {
        if (!vars.length) return '';
        return '('
            + vars.map(v => `$${v.name}: ${v.type}`).join(', ')
            + ')';
    }

    const renderGraphQLArgumentValue = (value: GraphQLArgumentValue): string => {
        if (isGraphQLVariableReference(value)) {
            return `$${value.name}`;
        }

        if (Array.isArray(value)) {
            return `[${value.map(renderGraphQLArgumentValue).join(', ')}]`;
        }

        if (typeof value === 'object' && value !== null) {
            return `{${
                Object.entries(value)
                    .map(([key, entryValue]) => `${key}: ${renderGraphQLArgumentValue(entryValue)}`)
                    .join(', ')
            }}`;
        }

        return renderGraphQLLiteral(value);
    };

    const renderFieldNode = (fieldNode: GraphQLFieldNode): string => {
        const fieldName = fieldNode.alias ? `${fieldNode.alias}: ${fieldNode.field}` : fieldNode.field;

        if (!fieldNode.args || fieldNode.args.length === 0) {
            return fieldName;
        }

        return `${fieldName}(${fieldNode.args.map(arg => `${arg.name}: ${renderGraphQLArgumentValue(arg.value)}`).join(', ')})`;
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
            const renderOrderBy = (orderBy: HasuraOrderBy | HasuraOrderBy[] | HasuraOrderDirection | undefined): string => {
                if (Array.isArray(orderBy)) {
                    return '[' + orderBy.map(renderOrderBy).join(', ') + ']';
                } else if (typeof orderBy === 'object' && orderBy !== undefined) {
                    return '{' + Object.entries(orderBy)
                        .map(([k, v]) => `${k}: ${renderOrderBy(v)}`)
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
        `  ${renderFieldNode(ast.rootField)} {` +
        selection +
        `\n  }\n}`
    );
}

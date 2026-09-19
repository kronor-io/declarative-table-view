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
import { mergeSelectionSetItem } from './selection-set.js';

export type GraphQLVariable = {
    name: string;
    type: string;
};

export type GraphQLVariableReference = {
    type: 'variable';
    name: string;
};

/**
 * A GraphQL enum value, which is rendered bare (`ASC`) rather than quoted
 * (`"ASC"`). Hasura's `order_by` directions and `distinct_on` columns are
 * enums, so they cannot be expressed as plain strings.
 */
export type GraphQLEnumValue = {
    type: 'enum';
    value: string;
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
    | GraphQLEnumValue
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

/** A root field together with the selection set taken from it. */
export type GraphQLRootField = GraphQLFieldNode & {
    selectionSet: GraphQLSelectionSet;
};

/** A document with exactly one root field. */
export type GraphQLQueryAST = {
    operation: 'query';
    name?: string;
    variables: GraphQLVariable[];
    rootField: GraphQLFieldNode;
    selectionSet: GraphQLSelectionSet;
};

/**
 * A document with any number of root fields, for callers that need to fetch
 * several unrelated collections in one round trip (an entity plus the option
 * lists its form needs, say). Root fields are rendered in order; give any two
 * that name the same collection distinct aliases.
 */
export type GraphQLMultiRootQueryAST = {
    operation: 'query';
    name?: string;
    variables: GraphQLVariable[];
    rootFields: GraphQLRootField[];
};

export type GraphQLDocumentAST = GraphQLQueryAST | GraphQLMultiRootQueryAST;

/** Normalizes either document shape to its list of root fields. */
export function rootFieldsOf(ast: GraphQLDocumentAST): GraphQLRootField[] {
    if ('rootFields' in ast) {
        return ast.rootFields;
    }

    return [{ ...ast.rootField, selectionSet: ast.selectionSet }];
}

export function renderGraphQLLiteral(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null';
    // Variable references and enum values are markers rather than data: they
    // render bare so that they can appear anywhere a literal can, including
    // inside the operator values of a `where` clause.
    if (isGraphQLVariableReference(value)) return `$${value.name}`;
    if (isGraphQLEnumValue(value)) return value.value;
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

export function graphqlEnumValue(value: string): GraphQLEnumValue {
    return {
        type: 'enum',
        value,
    };
}

export function isGraphQLEnumValue(value: unknown): value is GraphQLEnumValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as GraphQLEnumValue).type === 'enum' && typeof (value as GraphQLEnumValue).value === 'string';
}

/**
 * Lowers a Hasura `order_by` into an argument value whose directions are enums.
 * Directions are upper-cased, so both `'asc'` and `'ASC'` are accepted.
 */
export function orderByArgumentValue(orderBy: HasuraOrderBy | HasuraOrderBy[]): GraphQLArgumentValue {
    const lower = (value: HasuraOrderBy | HasuraOrderBy[] | HasuraOrderDirection): GraphQLArgumentValue => {
        if (Array.isArray(value)) {
            return value.map(lower);
        }

        if (typeof value === 'object' && value !== null) {
            return Object.fromEntries(
                Object.entries(value).map(([key, entryValue]) => [key, lower(entryValue)])
            );
        }

        return graphqlEnumValue(String(value).toUpperCase());
    };

    return lower(orderBy);
}

export function toGraphQLArgumentValue(value: unknown): GraphQLArgumentValue {
    if (isGraphQLVariableReference(value) || isGraphQLEnumValue(value)) {
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
 *
 * A path that partially overlaps an existing selection is merged into it, so
 * ensuring `customer.id` next to an already-selected `customer { name }` yields
 * one `customer` selection rather than two sibling blocks.
 */
export function ensureSelectionPath(
    selectionSet: GraphQLSelectionSet,
    fieldPath: string,
): GraphQLSelectionSet {
    const path = fieldPath.split('.').filter(Boolean);

    const hasSelectionPath = (set: GraphQLSelectionSet, remainingPath: string[]): boolean => {
        const [head, ...tail] = remainingPath;
        const selection = set.find(sel => sel.field === head || sel.alias === head);
        if (!selection) return false;
        if (tail.length === 0) return true;
        return selection.selections ? hasSelectionPath(selection.selections, tail) : false;
    };

    if (hasSelectionPath(selectionSet, path)) {
        return [...selectionSet];
    }

    const buildNested = (path: string): GraphQLSelectionSetItem => {
        const parts = path.split('.');
        const head = parts[0];
        if (parts.length === 1) return { field: head };
        return { field: head, selections: [buildNested(parts.slice(1).join('.'))] };
    };

    return mergeSelectionSetItem(selectionSet, buildNested(fieldPath));
}

export function renderGraphQLQuery(ast: GraphQLDocumentAST): string {
    function renderVariables(vars: GraphQLVariable[]): string {
        if (!vars.length) return '';
        return '('
            + vars.map(v => `$${v.name}: ${v.type}`).join(', ')
            + ')';
    }

    const renderGraphQLArgumentValue = (value: GraphQLArgumentValue): string => {
        if (isGraphQLVariableReference(value) || isGraphQLEnumValue(value)) {
            return renderGraphQLLiteral(value);
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
        if (item.offset !== undefined) args.push(`offset: ${item.offset}`);
        if (item.path) args.push(`path: "${item.path}"`);
        if (item.distinct_on && item.distinct_on.length) {
            args.push(`distinctOn: ${renderGraphQLArgumentValue(item.distinct_on.map(column => graphqlEnumValue(String(column))))}`);
        }
        if (item.order_by) {
            args.push(`orderBy: ${renderGraphQLArgumentValue(orderByArgumentValue(item.order_by))}`);
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
    const opName = ast.name ? ` ${ast.name}` : '';
    const rootFields = rootFieldsOf(ast)
        .map(rootField =>
            `  ${renderFieldNode(rootField)} {` +
            renderSelectionSet(rootField.selectionSet) +
            `\n  }`)
        .join('\n');

    return (
        `${ast.operation}${opName}${vars} {` +
        rootFields +
        `\n}`
    );
}

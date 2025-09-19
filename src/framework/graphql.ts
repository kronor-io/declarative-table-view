import { FilterFormState } from '../components/FilterForm';
import { FilterField } from './filters';
import { ColumnDefinition, FieldQuery, OrderByConfig, QueryConfig } from './column-definition';
import { FilterState } from './state';

// All supported Hasura operators for a field
export type HasuraOperator =
    | { _eq?: any }
    | { _neq?: any }
    | { _gt?: any }
    | { _lt?: any }
    | { _gte?: any }
    | { _lte?: any }
    | { _in?: any[] }
    | { _nin?: any[] }
    | { _like?: string }
    | { _ilike?: string }
    | { _is_null?: boolean }
    | { _similar?: string }
    | { _nsimilar?: string }
    | { _regex?: string }
    | { _nregex?: string }
    | { _iregex?: string }
    | { _niregex?: string };

// Type for Hasura boolean expressions (conditions)
export type HasuraCondition =
    | { _and: HasuraCondition[] }
    | { _or: HasuraCondition[] }
    | { _not: HasuraCondition }
    | { [field: string]: HasuraOperator | HasuraOperator[] };

// New version: build Hasura conditions from FilterFormState and FilterFieldSchema
export function buildHasuraConditions(
    filterState: FilterState
): HasuraCondition {
    // Support dot-separated keys by building nested objects and handle and/or field expressions
    function buildNestedKey(field: FilterField, cond: any): HasuraCondition {
        // Handle object format for multi-field expressions
        if (typeof field === 'object') {
            if ('and' in field) {
                const conditions = field.and.map(fieldName => buildSingleNestedKey(fieldName, cond));
                return { _and: conditions };
            }
            if ('or' in field) {
                const conditions = field.or.map(fieldName => buildSingleNestedKey(fieldName, cond));
                return { _or: conditions };
            }
        }

        // Handle single field name (string)
        if (typeof field === 'string') {
            return buildSingleNestedKey(field, cond);
        }

        // Fallback
        return {};
    }    // Helper to build nested object from dot notation key for a single field
    function buildSingleNestedKey(key: string, cond: any): HasuraCondition {
        if (!key.includes('.')) return { [key]: cond };
        const parts = key.split('.');
        return parts.reverse().reduce((acc, k) => ({ [k]: acc }), cond);
    }

    // Recursively convert FilterFormState to HasuraCondition
    function stateToCondition(state: FilterFormState): HasuraCondition | null {
        if (state.type === 'and' || state.type === 'or') {
            const children = state.children
                .map(stateToCondition)
                .filter((c): c is HasuraCondition => !!c);
            if (children.length === 0) return null;
            if (state.type === 'and') return { _and: children } as HasuraCondition;
            if (state.type === 'or') return { _or: children } as HasuraCondition;
        } else if (state.type === 'not') {
            const child = stateToCondition(state.child);
            if (!child) return null;
            return { _not: child } as HasuraCondition;
        } else if (state.type === 'leaf') {
            // Handle customOperator
            if (state.control && state.control.type === 'customOperator') {
                const opVal = state.value;
                if (!opVal || !opVal.operator || opVal.value === undefined || opVal.value === '' || opVal.value === null || (Array.isArray(opVal.value) && opVal.value.length === 0)) return null;
                return buildNestedKey(state.field, { [opVal.operator]: opVal.value });
            }
            if (state.value === undefined || state.value === '' || state.value === null || (Array.isArray(state.value) && state.value.length === 0)) return null;
            // Map filterType to Hasura operator
            const opMap: Record<string, string> = {
                equals: '_eq',
                notEquals: '_neq',
                greaterThan: '_gt',
                lessThan: '_lt',
                greaterThanOrEqual: '_gte',
                lessThanOrEqual: '_lte',
                in: '_in',
                notIn: '_nin',
                like: '_like',
                iLike: '_ilike',
                isNull: '_is_null',
            };
            const op = opMap[state.filterType];
            if (!op) return null;
            // Support dot-separated keys by building nested objects
            return buildNestedKey(state.field, { [op]: state.value });
        }
        return null;
    }
    const conditions = Array.from(filterState.values())
        .map(stateToCondition)
        .filter((c): c is HasuraCondition => !!c);
    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { _and: conditions };
}

// Helper to merge two GraphQLSelectionSets
function mergeSelectionSets(set1: GraphQLSelectionSet, set2: GraphQLSelectionSet): GraphQLSelectionSet {
    const merged = [...set1];

    for (const item2 of set2) {
        // For aliased fields, we need to match on both alias and field name
        const existingItem = merged.find(item1 =>
            item1.field === item2.field &&
            item1.alias === item2.alias &&
            item1.path === item2.path
        );
        if (existingItem) {
            // Deep merge selections if both have them
            if (existingItem.selections && item2.selections) {
                existingItem.selections = mergeSelectionSets(existingItem.selections, item2.selections);
            }
            // Naive merge of other properties, assuming they don't conflict or last one wins
            if (item2.limit !== undefined) existingItem.limit = item2.limit;
            if (item2.order_by) existingItem.order_by = item2.order_by;
            if (item2.where) existingItem.where = item2.where;
            if (item2.path) existingItem.path = item2.path;
            // etc. for other properties
        } else {
            merged.push(item2);
        }
    }

    return merged;
}

// Generates a GraphQL selection set from a FieldQuery[] (tagged ADT)
export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): GraphQLSelectionSet {
    // Helper to apply alias to the deepest field in a nested structure
    function applyAliasToDeepestField(item: GraphQLSelectionSetItem, alias: string): GraphQLSelectionSetItem {
        if (item.selections && item.selections.length > 0) {
            // If there are nested selections, recursively apply to the deepest one
            const lastSelection = item.selections[item.selections.length - 1];
            const updatedLastSelection = applyAliasToDeepestField(lastSelection, alias);
            return {
                ...item,
                selections: [
                    ...item.selections.slice(0, -1),
                    updatedLastSelection
                ]
            };
        } else {
            // This is the deepest field, apply the alias here
            return { ...item, alias };
        }
    }

    // Helper to process FieldQuery recursively
    function processFieldQuery(fieldQuery: FieldQuery): GraphQLSelectionSetItem | null {
        if (fieldQuery.type === 'field') {
            const parts = fieldQuery.path.split('.');
            const buildNested = (p: string[]): GraphQLSelectionSetItem => {
                const [head, ...tail] = p;
                const item: GraphQLSelectionSetItem = { field: head };
                if (tail.length > 0) {
                    item.selections = [buildNested(tail)];
                }
                return item;
            };
            return buildNested(parts);
        } else if (fieldQuery.type === 'queryConfigs') {
            if (!fieldQuery.configs.length) return null;

            // Recursive helper to build nested selection items
            const buildNestedItem = (configs: QueryConfig[]): GraphQLSelectionSetItem => {
                const [head, ...tail] = configs;
                const item: GraphQLSelectionSetItem = { field: head.field };

                if (head.orderBy) {
                    const toHasuraOrderBy = (ob: OrderByConfig | OrderByConfig[]): HasuraOrderBy | HasuraOrderBy[] => {
                        if (Array.isArray(ob)) {
                            return ob.map(o => ({ [o.key]: o.direction.toUpperCase() as 'ASC' | 'DESC' }));
                        }
                        return { [ob.key]: ob.direction.toUpperCase() as 'ASC' | 'DESC' };
                    };
                    item.order_by = toHasuraOrderBy(head.orderBy);
                }

                if (head.limit !== undefined) {
                    item.limit = head.limit;
                }

                if (head.path) {
                    item.path = head.path;
                }

                if (tail.length) {
                    item.selections = [buildNestedItem(tail)];
                }

                return item;
            };

            return buildNestedItem(fieldQuery.configs);
        } else if (fieldQuery.type === 'fieldAlias') {
            // Process the underlying field query
            const underlyingItem = processFieldQuery(fieldQuery.field);
            if (underlyingItem) {
                // For different types of underlying fields, apply alias differently:
                if (fieldQuery.field.type === 'field') {
                    // For simple fields (potentially nested), apply alias to the deepest field
                    return applyAliasToDeepestField(underlyingItem, fieldQuery.alias);
                } else if (fieldQuery.field.type === 'queryConfigs') {
                    // For queryConfigs, apply alias to the root field
                    underlyingItem.alias = fieldQuery.alias;
                    return underlyingItem;
                }
            }
            return underlyingItem;
        }
        return null;
    }
    // Build selection set for all columns and all FieldQuery[]
    const allSelections = columns.flatMap(col => col.data.map(processFieldQuery).filter((item): item is GraphQLSelectionSetItem => !!item));

    // Deep merge all generated selection sets
    return allSelections.reduce((acc: GraphQLSelectionSet, current: GraphQLSelectionSetItem) => {
        return mergeSelectionSets(acc, [current]);
    }, []);
}

export function generateGraphQLQueryAST(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string
): GraphQLQueryAST {
    const selectionSet = generateSelectionSetFromColumns(columns);
    return {
        operation: 'query',
        variables: [
            { name: 'conditions', type: boolExpType },
            { name: 'limit', type: 'Int' },
            { name: 'orderBy', type: orderByType }
        ],
        rootField: `${rootField}(where: $conditions, limit: $limit, orderBy: $orderBy)`,
        selectionSet: selectionSet
    };
}

// Generates a full GraphQL query string for a given root field and schema, supporting only limit (Int), conditions (Hasura condition), and orderBy (Hasura ordering)
export function generateGraphQLQuery(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string
): string {
    const ast = generateGraphQLQueryAST(rootField, columns, boolExpType, orderByType);
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

// Renders a GraphQLQueryAST to a GraphQL query string
export function renderGraphQLQuery(ast: GraphQLQueryAST): string {
    function renderVariables(vars: GraphQLVariable[]): string {
        if (!vars.length) return '';
        return '('
            + vars.map(v => `$${v.name}: ${v.type}`).join(', ')
            + ')';
    }

    function renderArgs(item: GraphQLSelectionSetItem): string {
        const args: string[] = [];
        if (item.where) {
            // Recursively render HasuraCondition as GraphQL, not JSON
            const renderWhere = (cond: HasuraCondition | HasuraOperator | HasuraOperator[]): string => {
                if (Array.isArray(cond)) {
                    // Array of HasuraCondition or HasuraOperator
                    return `[${cond.map(renderWhere).join(", ")}]`;
                } else if (typeof cond === 'object' && cond !== null) {
                    if ('_and' in cond && Array.isArray(cond._and)) {
                        return `_and: [${cond._and.map(renderWhere).join(", ")}]`;
                    }
                    if ('_or' in cond && Array.isArray(cond._or)) {
                        return `_or: [${cond._or.map(renderWhere).join(", ")}]`;
                    }
                    if ('_not' in cond) {
                        return `_not: {${renderWhere(cond._not)}}`;
                    }
                    // Field operators (HasuraOperator or HasuraOperator[])
                    return Object.entries(cond)
                        .map(([field, op]) => {
                            if (Array.isArray(op)) {
                                // Array of HasuraOperator
                                return `${field}: [${op.map(renderWhere).join(", ")}]`;
                            } else if (typeof op === 'object' && op !== null) {
                                // Single HasuraOperator
                                return `${field}: {${Object.entries(op)
                                    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
                                    .join(", ")}}`;
                            } else {
                                // Primitive value (should not happen for HasuraOperator, but fallback)
                                return `${field}: ${typeof op === 'string' ? `"${op}"` : JSON.stringify(op)}`;
                            }
                        })
                        .join(", ");
                }
                return JSON.stringify(cond);
            };
            args.push(`where: {${renderWhere(item.where)}}`);
        }
        if (item.limit !== undefined)
            args.push(`limit: ${item.limit}`);
        if (item.path)
            args.push(`path: "${item.path}"`);
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

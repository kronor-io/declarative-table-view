import { FilterFormState } from '../components/FilterForm';
import { ColumnDefinition } from './column-definition';

// Type for Hasura boolean expressions (conditions)
export type HasuraCondition =
    | { _and: HasuraCondition[] }
    | { _or: HasuraCondition[] }
    | { _not: HasuraCondition }
    | { [key: string]: any };

// New version: build Hasura conditions from FilterFormState and FilterFieldSchema
export function buildHasuraConditions(
    formStates: FilterFormState[]
): HasuraCondition {
    // Recursively convert FilterFormState to HasuraCondition
    function stateToCondition(state: FilterFormState): HasuraCondition | null {
        if (state.type === 'and' || state.type === 'or') {
            const children = state.children
                .map(stateToCondition)
                .filter((c): c is HasuraCondition => !!c);
            if (children.length === 0) return null;
            return { ["_" + state.type]: children };
        } else if (state.type === 'not') {
            const child = stateToCondition(state.child);
            if (!child) return null;
            return { _not: child };
        } else if (state.type === 'leaf') {
            // Handle customOperator
            if (state.control && state.control.type === 'customOperator') {
                const opVal = state.value;
                if (!opVal || !opVal.operator || opVal.value === undefined || opVal.value === '' || opVal.value === null || (Array.isArray(opVal.value) && opVal.value.length === 0)) return null;
                return { [state.key]: { [opVal.operator]: opVal.value } };
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
            function buildNestedKey(key: string, cond: any): any {
                if (!key.includes('.')) return { [key]: cond };
                const parts = key.split('.');
                return parts.reverse().reduce((acc, k) => ({ [k]: acc }), cond);
            }
            return buildNestedKey(state.key, { [op]: state.value });
        }
        return null;
    }
    const conditions = formStates
        .map(stateToCondition)
        .filter((c): c is HasuraCondition => !!c);
    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { _and: conditions };
}

// Helper to extract all unique data paths from columns
function getAllUniquePaths(columns: ColumnDefinition[]): string[] {
    const paths = columns.flatMap(col => col.data);
    return Array.from(new Set(paths));
}

// Generates a GraphQL selection set from an array of dot-separated data paths (column definitions)
export function generateSelectionSetFromColumns(columns: ColumnDefinition[]): string {
    // Build a nested object tree from dot paths
    const tree: Record<string, any> = {};
    const allPaths = getAllUniquePaths(columns);
    for (const pathStr of allPaths) {
        const path = pathStr.split('.');
        let curr = tree;
        for (let i = 0; i < path.length; i++) {
            if (!curr[path[i]]) curr[path[i]] = {};
            curr = curr[path[i]];
        }
    }
    // Recursively build selection set string
    function build(obj: Record<string, any>): string {
        return Object.entries(obj)
            .map(([key, value]) => {
                const subfields = Object.keys(value);
                if (subfields.length === 0) {
                    return key;
                } else {
                    return `${key} { ${build(value)} }`;
                }
            })
            .join(' ');
    }
    return build(tree);
}

// Generates a full GraphQL query string for a given root field and schema, supporting only limit (Int), conditions (Hasura condition), and orderBy (Hasura ordering)
export function generateGraphQLQuery(
    rootField: string,
    columns: ColumnDefinition[],
    boolExpType: string,
    orderByType: string
): string {
    const selectionSet = generateSelectionSetFromColumns(columns);
    return `query($conditions: ${boolExpType}, $limit: Int, $orderBy: ${orderByType}) {\n  ${rootField}(where: $conditions, limit: $limit, orderBy: $orderBy) {\n    ${selectionSet}\n  }\n}`;
}

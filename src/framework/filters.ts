export type FilterControl =
    | { type: 'text'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'number'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'date'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'dropdown'; label?: string; items: { label: string; value: any }[]; initialValue?: any }
    | { type: 'multiselect'; label?: string; items: { label: string; value: any }[], filterable?: boolean; initialValue?: any }
    | { type: 'customOperator'; label?: string; operators: { label: string; value: string }[]; valueControl: FilterControl; initialValue?: any }
    | { type: 'custom'; component: React.ComponentType<any>; props?: Record<string, any>; label?: string; initialValue?: any };

export type FilterExpr =
    | { type: 'equals'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'notEquals'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'greaterThan'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'lessThan'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'greaterThanOrEqual'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'lessThanOrEqual'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'in'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'notIn'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'like'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'iLike'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'isNull'; key: string; value: FilterControl; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'and'; filters: FilterExpr[] }
    | { type: 'or'; filters: FilterExpr[] }
    | { type: 'not'; filter: FilterExpr };



// Predefined list of supported operators for customOperator controls
export const SUPPORTED_OPERATORS = [
    { label: 'equals', value: '_eq' },
    { label: 'not equals', value: '_neq' },
    { label: 'greater than', value: '_gt' },
    { label: 'less than', value: '_lt' },
    { label: 'greater than or equal', value: '_gte' },
    { label: 'less than or equal', value: '_lte' },
    { label: 'in', value: '_in' },
    { label: 'not in', value: '_nin' },
    { label: 'like', value: '_like' },
    { label: 'ilike', value: '_ilike' },
    { label: 'is null', value: '_is_null' }
];

// Helper functions for building FilterControl values
export const filterControl = {
    text: (options?: { label?: string; placeholder?: string }): FilterControl => ({ type: 'text', ...options }),
    number: (options?: { label?: string; placeholder?: string; initialValue?: any }): FilterControl => ({ type: 'number', ...options }),
    date: (options?: { label?: string; placeholder?: string; initialValue?: any }): FilterControl => ({ type: 'date', ...options }),
    dropdown: (options: { label?: string; items: { label: string; value: any }[] }): FilterControl => ({ type: 'dropdown', ...options }),
    multiselect: (options: { label?: string; items: { label: string; value: any }[], filterable?: boolean }): FilterControl => ({ type: 'multiselect', ...options }),
    customOperator: (options: { label?: string; operators: { label: string; value: string }[]; valueControl: FilterControl }): FilterControl => ({ type: 'customOperator', ...options }),
    custom: (component: React.ComponentType<any>, options?: { label?: string; props?: Record<string, any> }): FilterControl => ({ type: 'custom', component, ...options }),
};

// Helper functions for building FilterExpr values
export const filterExpr = {
    equals: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'equals', key, value, ...(transform && { transform }) }),
    notEquals: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'notEquals', key, value, ...(transform && { transform }) }),
    greaterThan: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'greaterThan', key, value, ...(transform && { transform }) }),
    lessThan: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'lessThan', key, value, ...(transform && { transform }) }),
    greaterThanOrEqual: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'greaterThanOrEqual', key, value, ...(transform && { transform }) }),
    lessThanOrEqual: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'lessThanOrEqual', key, value, ...(transform && { transform }) }),
    in: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'in', key, value, ...(transform && { transform }) }),
    notIn: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'notIn', key, value, ...(transform && { transform }) }),
    like: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'like', key, value, ...(transform && { transform }) }),
    iLike: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'iLike', key, value, ...(transform && { transform }) }),
    isNull: (key: string, value: FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr => ({ type: 'isNull', key, value, ...(transform && { transform }) }),
    and: (filters: FilterExpr[]): FilterExpr => ({ type: 'and', filters }),
    or: (filters: FilterExpr[]): FilterExpr => ({ type: 'or', filters }),
    not: (filter: FilterExpr): FilterExpr => ({ type: 'not', filter }),
    range: (key: string, control: (options: any) => FilterControl, transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any }): FilterExpr =>
        filterExpr.and([
            filterExpr.greaterThanOrEqual(key, control({ placeholder: 'from' }), transform),
            filterExpr.lessThanOrEqual(key, control({ placeholder: 'to' }), transform)
        ]),
    allOperators: SUPPORTED_OPERATORS,
};

// Helper to check if a FilterExpr is a leaf node
export function isLeaf(expr: FilterExpr): expr is Extract<FilterExpr, { key: string; value: FilterControl }> {
    return 'key' in expr && 'value' in expr;
}

// Recursively transform the value of every leaf node in a FilterExpr tree
export function transformFilterExprValues(expr: FilterExpr, fn: (value: FilterControl) => FilterControl): FilterExpr {
    if (expr.type === 'and' || expr.type === 'or') {
        return { ...expr, filters: expr.filters.map(e => transformFilterExprValues(e, fn)) };
    } else if (expr.type === 'not') {
        return { ...expr, filter: transformFilterExprValues(expr.filter, fn) };
    } else {
        return { ...expr, value: fn(expr.value) };
    }
}

export type FilterExprKeyNode = Extract<FilterExpr, { key: string; value: FilterControl }>;
export type FilterExprFilterListNode = Extract<FilterExpr, { filters: FilterExpr[] }>;
export type FilterExprNotNode = Extract<FilterExpr, { filter: FilterExpr }>;

// Recursively get all key nodes from a FilterExpr tree
export function getKeyNodes(expr: FilterExpr): FilterExprKeyNode[] {
    const nodes: FilterExprKeyNode[] = [];
    if (isLeaf(expr)) {
        nodes.push(expr);
    } else if (expr.type === 'and' || expr.type === 'or') {
        for (const filter of expr.filters) {
            nodes.push(...getKeyNodes(filter));
        }
    } else if (expr.type === 'not') {
        nodes.push(...getKeyNodes(expr.filter));
    }
    return nodes;
}

export function buildHasuraConditionFromExpr(expr: FilterExpr): any {
    switch (expr.type) {
        case 'equals':
            return buildFieldCondition(expr.key, { _eq: expr.value });
        case 'notEquals':
            return buildFieldCondition(expr.key, { _neq: expr.value });
        case 'greaterThan':
            return buildFieldCondition(expr.key, { _gt: expr.value });
        case 'lessThan':
            return buildFieldCondition(expr.key, { _lt: expr.value });
        case 'greaterThanOrEqual':
            return buildFieldCondition(expr.key, { _gte: expr.value });
        case 'lessThanOrEqual':
            return buildFieldCondition(expr.key, { _lte: expr.value });
        case 'in':
            return buildFieldCondition(expr.key, { _in: expr.value });
        case 'notIn':
            return buildFieldCondition(expr.key, { _nin: expr.value });
        case 'like':
            return buildFieldCondition(expr.key, { _like: expr.value });
        case 'iLike':
            return buildFieldCondition(expr.key, { _ilike: expr.value });
        case 'isNull':
            return buildFieldCondition(expr.key, { _is_null: expr.value });
        case 'and':
            return { _and: expr.filters.map(buildHasuraConditionFromExpr) };
        case 'or':
            return { _or: expr.filters.map(buildHasuraConditionFromExpr) };
        case 'not':
            return { _not: buildHasuraConditionFromExpr(expr.filter) };
        default:
            return {};
    }
}

// Helper to build nested object from dot notation key
function buildFieldCondition(key: string, cond: any): any {
    if (!key.includes('.')) return { [key]: cond };
    const parts = key.split('.');
    return parts.reverse().reduce((acc, k) => ({ [k]: acc }), cond);
}

export type FilterFieldGroup = {
    name: string;
    label: string | null;
};

export type FilterFieldSchemaFilter = {
    label: string;
    expression: FilterExpr;
    group: string; // group name
};

export type FilterFieldSchema = {
    groups: FilterFieldGroup[];
    filters: FilterFieldSchemaFilter[];
};

/**
 * Attempts to deserialize a plain JSON object into a FilterExpr.
 * Does not support custom filters or transformation functions.
 */
export function filterExprFromJSON(json: any): FilterExpr | null {
    if (!json || typeof json !== 'object' || !json.type) return null;
    switch (json.type) {
        case 'equals':
        case 'notEquals':
        case 'greaterThan':
        case 'lessThan':
        case 'greaterThanOrEqual':
        case 'lessThanOrEqual':
        case 'in':
        case 'notIn':
        case 'like':
        case 'iLike':
        case 'isNull':
            // Only support basic FilterControl types (text, number, date, dropdown, multiselect)
            if (!json.key || !json.value || typeof json.value !== 'object' || !json.value.type) return null;
            const allowedTypes = ['text', 'number', 'date', 'dropdown', 'multiselect'];
            if (!allowedTypes.includes(json.value.type)) return null;
            return {
                type: json.type,
                key: json.key,
                value: json.value
            } as FilterExpr;
        case 'and':
        case 'or':
            if (!Array.isArray(json.filters)) return null;
            const children = json.filters.map(filterExprFromJSON).filter(Boolean) as FilterExpr[];
            return { type: json.type, filters: children };
        case 'not':
            if (!json.filter) return null;
            const child = filterExprFromJSON(json.filter);
            if (!child) return null;
            return { type: 'not', filter: child };
        default:
            return null;
    }
}

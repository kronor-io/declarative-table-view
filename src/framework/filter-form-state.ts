import { FilterFieldSchema, FilterField, FilterControl, FilterExpr } from './filters';

// Tree-like state for FilterForm
export type FilterFormState =
    | {
        type: 'leaf';
        field: FilterField;
        value: any;
        control: FilterControl;
        filterType: Extract<FilterExpr, { field: FilterField }>['type'];
    }
    | { type: 'and' | 'or'; children: FilterFormState[]; filterType: 'and' | 'or' }
    | { type: 'not'; child: FilterFormState; filterType: 'not' };

/**
 * Helper to serialize FilterFormState to JSON for storage
 */
export function serializeFilterFormState(node: FilterFormState): any {
    if (node.type === 'leaf') {
        let value = node.value;
        if (value instanceof Date) {
            value = value.toISOString();
        }
        return { ...node, value };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: serializeFilterFormState(node.child),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: node.children.map(serializeFilterFormState),
            filterType: node.filterType
        };
    }
}

/**
 * Serialize an array of FilterFormState to JSON for storage
 */
export function serializeFilterFormStateArray(state: FilterFormState[]): any {
    return state.map(node => serializeFilterFormState(node));
}

/**
 * Helper to collect all date field names from a filter schema
 */
function collectDateFieldsFromSchema(schema: FilterFieldSchema): Set<string> {
    const dateFields = new Set<string>();

    function traverse(expr: any) {
        if (expr.type === 'and' || expr.type === 'or') {
            expr.filters.forEach(traverse);
        } else if ('field' in expr && 'value' in expr && expr.value.type === 'date') {
            // Handle FilterField - extract all individual field names
            if (typeof expr.field === 'string') {
                dateFields.add(expr.field);
            } else if ('and' in expr.field) {
                expr.field.and.forEach((field: string) => dateFields.add(field));
            } else if ('or' in expr.field) {
                expr.field.or.forEach((field: string) => dateFields.add(field));
            }
        }
    }

    schema.filters.forEach(filter => traverse(filter.expression));
    return dateFields;
}

/**
 * Helper to deserialize a node and convert ISO date strings back to Date objects
 */
function deserializeFilterFormStateNode(node: any, dateFields: Set<string>): FilterFormState {
    if (node.type === 'leaf') {
        let value = node.value;
        if (dateFields.has(node.field) && typeof value === 'string') {
            try {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    value = date;
                } else {
                    console.warn(`Failed to parse date for field ${node.field}:`, value);
                }
            } catch {
                console.warn(`Failed to parse date for field ${node.field}:`, value);
            }
        }
        return { ...node, value };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: deserializeFilterFormStateNode(node.child, dateFields),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: node.children.map((child: any) => deserializeFilterFormStateNode(child, dateFields)),
            filterType: node.filterType
        };
    }
}

/**
 * Parse serialized filter state back to FilterFormState array
 * This is the core function that doesn't require a SavedFilter object
 */
export function parseFilterFormState(serializedState: any[], schema: FilterFieldSchema): FilterFormState[] {
    try {
        const dateFields = collectDateFieldsFromSchema(schema);
        return serializedState.map((node: any) => deserializeFilterFormStateNode(node, dateFields));
    } catch {
        console.error('Failed to parse filter state');
        return [];
    }
}

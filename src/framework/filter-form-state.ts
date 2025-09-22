import { FilterFieldSchema, FilterField, FilterControl, FilterExpr } from './filters';
import { FilterState } from './state';

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
 * Generic helper to apply a transformation function to all leaf values in a FilterFormState tree
 */
export function mapFilterFormState<T>(
    node: FilterFormState,
    transformValue: (value: any, field: FilterField) => T
): FilterFormState {
    if (node.type === 'leaf') {
        return {
            ...node,
            value: transformValue(node.value, node.field)
        };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: mapFilterFormState(node.child, transformValue),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: node.children.map(child => mapFilterFormState(child, transformValue)),
            filterType: node.filterType
        };
    }
}

/**
 * Helper to serialize a FilterFormState node, converting Date objects to ISO strings
 */
export function makeFilterFormStateSerializable(node: FilterFormState): FilterFormState {
    return mapFilterFormState(node, (value) => {
        if (value instanceof Date) {
            return value.toISOString();
        }
        return value;
    });
}

/**
 * Serialize a FilterState Map to JSON object for storage
 */
export function serializeFilterFormStateMap(state: FilterState): Record<string, any> {
    return Object.fromEntries(
        Array.from(state.entries())
            .map(([id, node]) => [id, makeFilterFormStateSerializable(node)])
    );
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
 * Parse serialized filter state back to FilterFormState map
 */
export function parseFilterFormState(serializedState: any, schema: FilterFieldSchema): FilterState {
    try {
        const dateFields = collectDateFieldsFromSchema(schema);
        return new Map(Object.entries(serializedState).map(([id, node]) => [id, deserializeFilterFormStateNode(node, dateFields)]));
    } catch {
        console.error('Failed to parse filter state');
        return new Map();
    }
}

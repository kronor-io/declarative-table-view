import { FilterSchemasAndGroups, FilterField, FilterControl, FilterExpr, FilterTransform } from './filters';
import { FilterState } from './state';

// Tree-like state for FilterForm
export type FilterFormState =
    | {
        type: 'leaf';
        value: any;
    }
    | { type: 'and' | 'or'; children: FilterFormState[] }
    | { type: 'not'; child: FilterFormState };

/**
 * Generic helper to apply a transformation function to all leaf values in a FilterFormState tree
 */
export function mapFilterFormState<T>(
    node: FilterFormState,
    transformValue: (value: any) => T
): FilterFormState {
    if (node.type === 'leaf') {
        return {
            ...node,
            value: transformValue(node.value)
        };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: mapFilterFormState(node.child, transformValue)
        };
    } else {
        return {
            type: node.type,
            children: node.children.map(child => mapFilterFormState(child, transformValue))
        };
    }
}

// Type aliases for narrowed FilterExpr types
type LeafFilterExpr = FilterExpr & { field: FilterField; value: FilterControl; transform?: FilterTransform };
type AndFilterExpr = FilterExpr & { type: 'and' };
type OrFilterExpr = FilterExpr & { type: 'or' };
type NotFilterExpr = FilterExpr & { type: 'not' };

/**
 * Helper function that recursively traverses both filter schema and state in parallel.
 * Calls the appropriate handler for each node in the tree based on the state node type.
 *
 * This helper is useful for operations that need to correlate schema information with state values,
 * such as:
 * - Building query conditions recursively
 * - Building validation result trees
 * - Transforming data structures while preserving tree shape
 * - Building UI components from schema + state
 *
 * @param schemaNode - The schema node to traverse
 * @param stateNode - The state node to traverse
 * @param handlers - Record of functions keyed by FilterFormState type, each handling specific node types
 * @returns Single result of type T built recursively
 */
export function traverseFilterSchemaAndState<T>(
    schemaNode: FilterExpr,
    stateNode: FilterFormState,
    handlers: {
        leaf: (schemaNode: LeafFilterExpr, stateNode: FilterFormState & { type: 'leaf' }) => T;
        and: (schemaNode: AndFilterExpr, stateNode: FilterFormState & { type: 'and' }, childResults: T[]) => T;
        or: (schemaNode: OrFilterExpr, stateNode: FilterFormState & { type: 'or' }, childResults: T[]) => T;
        not: (schemaNode: NotFilterExpr, stateNode: FilterFormState & { type: 'not' }, childResult: T) => T;
    }
): T {
    switch (stateNode.type) {
        case 'leaf':
            return handlers.leaf(schemaNode as LeafFilterExpr, stateNode as FilterFormState & { type: 'leaf' });

        case 'and': {
            const state = stateNode as FilterFormState & { type: 'and' };
            const schema = schemaNode
            if (schema.type !== 'and') {
                throw new Error(`Schema type mismatch: expected 'and', got '${schema.type}'`);
            }
            // Recursively traverse children
            const childResults = state.children.map((childState, index) => {
                const childSchema = schema.filters[index];
                if (!childSchema) {
                    throw new Error(`Missing schema for child at index ${index}`);
                }
                return traverseFilterSchemaAndState(childSchema, childState, handlers);
            });

            return handlers.and(schema, state, childResults);
        }

        case 'or': {
            const state = stateNode as FilterFormState & { type: 'or' };
            const schema = schemaNode
            if (schema.type !== 'or') {
                throw new Error(`Schema type mismatch: expected 'or', got '${schema.type}'`);
            }
            // Recursively traverse children
            const childResults = state.children.map((childState, index) => {
                const childSchema = schema.filters[index];
                if (!childSchema) {
                    throw new Error(`Missing schema for child at index ${index}`);
                }
                return traverseFilterSchemaAndState(childSchema, childState, handlers);
            });

            return handlers.or(schema, state, childResults);
        }

        case 'not': {
            const state = stateNode as FilterFormState & { type: 'not' };
            const schema = schemaNode
            if (schema.type !== 'not') {
                throw new Error(`Schema type mismatch: expected 'not', got '${schema.type}'`);
            }
            // Recursively traverse the child
            const childResult = traverseFilterSchemaAndState(schema.filter, state.child, handlers);
            return handlers.not(schema, state, childResult);
        }

        default:
            throw new Error(`Unknown state node type: ${(stateNode)}`);
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
function collectDateFieldsFromSchema(schema: FilterSchemasAndGroups): Set<string> {
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
            child: deserializeFilterFormStateNode(node.child, dateFields)
        };
    } else {
        return {
            type: node.type,
            children: node.children.map((child: any) => deserializeFilterFormStateNode(child, dateFields))
        };
    }
}

/**
 * Parse serialized filter state back to FilterFormState map
 */
export function parseFilterFormState(serializedState: any, schema: FilterSchemasAndGroups): FilterState {
    try {
        const dateFields = collectDateFieldsFromSchema(schema);
        return new Map(Object.entries(serializedState).map(([id, node]) => [id, deserializeFilterFormStateNode(node, dateFields)]));
    } catch {
        console.error('Failed to parse filter state');
        return new Map();
    }
}

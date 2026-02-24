import { FilterSchemasAndGroups, FilterField, FilterControl, FilterExpr } from './filters';
import { FilterState, buildInitialFormState, FormStateInitMode } from './state';

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
type LeafFilterExpr = Extract<FilterExpr, { field: FilterField; value: FilterControl }>;
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
 * Schema-aware emptiness check for a FilterFormState tree.
 * A leaf is considered empty when its primitive value is '' | null | [] (if array).
 * For customOperator controls we look at the nested `value` field inside { operator, value }.
 */
export function isFilterEmpty(state: FilterFormState, schemaExpr: FilterExpr): boolean {
    return traverseFilterSchemaAndState<boolean>(schemaExpr, state, {
        leaf: (schemaLeaf, stateLeaf) => {
            const value = stateLeaf.value;
            if (schemaLeaf.value.type === 'customOperator') {
                const inner = value?.value; // { operator, value }
                return inner === '' || inner === null || (Array.isArray(inner) && inner.length === 0);
            }
            return value === '' || value === null || (Array.isArray(value) && value.length === 0);
        },
        and: (_schemaAnd, _stateAnd, childResults) => childResults.every(Boolean),
        or: (_schemaOr, _stateOr, childResults) => childResults.every(Boolean),
        not: (_schemaNot, _stateNot, childResult) => childResult
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
 * Rehydrate a single filter's stored state using its schema expression.
 * Safely returns the original node on any mismatch / error.
 */
function rehydrateFilterStateForSchema(expression: FilterExpr, stored: FilterFormState): FilterFormState {
    return traverseFilterSchemaAndState<FilterFormState>(expression, stored, {
        leaf: (schemaLeaf, stateLeaf) => {
            let value = stateLeaf.value;
            if (schemaLeaf.value.type === 'date' && typeof value === 'string') {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    value = date;
                }
            }
            return { type: 'leaf', value };
        },
        and: (_schemaAnd, _stateAnd, childResults) => ({ type: 'and', children: childResults }),
        or: (_schemaOr, _stateOr, childResults) => ({ type: 'or', children: childResults }),
        not: (_schemaNot, _stateNot, childResult) => ({ type: 'not', child: childResult })
    });
}

/**
 * Parse serialized filter state (object keyed by filter id) back into a FilterState Map,
 * converting date string values to Date objects by consulting the filter schema.
 */
export function parseFilterFormState(serializedState: any, schema: FilterSchemasAndGroups): FilterState {
    return new Map(
        schema.filters.map(filter => {
            const raw = serializedState ? serializedState[filter.id] : undefined;
            if (raw && typeof raw === 'object' && 'type' in raw) {
                return [filter.id, rehydrateFilterStateForSchema(filter.expression, raw as FilterFormState)] as [string, FilterFormState];
            }
            // If invalid/missing, fall back to an empty initialized state derived from schema
            return [filter.id, buildInitialFormState(filter.expression, FormStateInitMode.Empty)] as [string, FilterFormState];
        })
    );
}

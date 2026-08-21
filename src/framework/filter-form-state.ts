import { FilterField, FilterControl, FilterExpr, FilterGroups } from './filters';
import { getAllFilters } from './view';
import { FilterState, buildInitialFormState, FormStateInitMode } from './state';
import * as FilterValue from './filterValue';

// Tree-like state for FilterForm
export type FilterFormState =
    | {
        type: 'leaf';
        value: FilterValue.FilterValue;
    }
    | { type: 'and' | 'or'; children: FilterFormState[] }
    | { type: 'not'; child: FilterFormState };

/**
 * Generic helper to apply a transformation function to all leaf values in a FilterFormState tree
 */
export function mapFilterFormState<T>(
    node: FilterFormState,
    transformValue: (value: unknown) => T
): FilterFormState {
    if (node.type === 'leaf') {
        return {
            ...node,
            value: FilterValue.map(transformValue, node.value)
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
            return handlers.leaf(schemaNode as LeafFilterExpr, stateNode);

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

function isEmptyLikePrimitive(value: unknown): boolean {
    return (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCustomOperatorLeafValue(value: unknown): FilterValue.FilterValue {
    // Canonical shape (in memory): { operator: string, value: FilterValue }
    // Empty-ness is determined solely by the nested `value`.
    if (!isRecord(value)) return FilterValue.empty;

    const operator = value['operator'];
    const inner = value['value'];
    if (typeof operator !== 'string') return FilterValue.empty;

    // New form: inner is already a FilterValue
    const innerFilterValue = FilterValue.fromObject(inner);
    if (innerFilterValue) {
        if (FilterValue.isEmpty(innerFilterValue)) return FilterValue.empty;
        return FilterValue.value({ operator, value: innerFilterValue });
    }

    // Legacy form: inner is a primitive
    if (isEmptyLikePrimitive(inner)) return FilterValue.empty;
    return FilterValue.value({ operator, value: FilterValue.value(inner) });
}

function migrateLegacyLeafValue(value: unknown, schemaLeaf: LeafFilterExpr): FilterValue.FilterValue {
    // Legacy leaves stored raw primitives; convert to ADT.
    // Preserve false/0; treat [] as empty (multiselect etc.).
    if (schemaLeaf.value.type === 'customOperator') {
        return normalizeCustomOperatorLeafValue(value);
    }

    if (isEmptyLikePrimitive(value)) return FilterValue.empty;
    return FilterValue.value(value);
}

function rehydrateLeafValueForSchema(schemaLeaf: LeafFilterExpr, stateLeaf: FilterFormState & { type: 'leaf' }): FilterValue.FilterValue {
    const rawValue = (stateLeaf as unknown as { value?: unknown }).value;
    const storedValue = FilterValue.fromObject(rawValue);

    if (schemaLeaf.value.type === 'customOperator') {
        if (!storedValue) return normalizeCustomOperatorLeafValue(rawValue);
        if (FilterValue.isEmpty(storedValue)) return FilterValue.empty;
        return normalizeCustomOperatorLeafValue(storedValue.value);
    }

    return storedValue ?? migrateLegacyLeafValue(rawValue, schemaLeaf);
}

/**
 * Schema-aware emptiness check for a FilterFormState tree.
 * A leaf is considered empty when its primitive value is '' | null | [] (if array).
 * For customOperator controls we look at the nested `value` field inside { operator, value }.
 */
export function isFilterEmpty(state: FilterFormState, schemaExpr: FilterExpr): boolean {
    return traverseFilterSchemaAndState<boolean>(schemaExpr, state, {
        leaf: (schemaLeaf, stateLeaf) => {
            if (FilterValue.isEmpty(stateLeaf.value)) return true;
            if (schemaLeaf.value.type === 'customOperator') {
                const operatorAndValue = stateLeaf.value.value as { operator: string; value: FilterValue.FilterValue };
                return FilterValue.isEmpty(operatorAndValue.value);
            }
            return false;
        },
        and: (_schemaAnd, _stateAnd, childResults) => childResults.every(Boolean),
        or: (_schemaOr, _stateOr, childResults) => childResults.every(Boolean),
        not: (_schemaNot, _stateNot, childResult) => childResult
    });
}

/**
 * Serialize a FilterState Map to a JSON object for persistence/sharing.
 * Requires schema so emptiness can be evaluated correctly.
 */
export function serializeFilterFormStateMap(
    state: FilterState,
    filterGroups: FilterGroups
): Record<string, any> {
    const filtersById = new Map(getAllFilters(filterGroups).map(f => [f.id, f] as const));

    return Object.fromEntries(
        Array.from(state.entries()).flatMap(([id, node]) => {
            const filter = filtersById.get(id);
            if (filter && isFilterEmpty(node, filter.expression)) {
                return [];
            }

            return [[id, makeFilterFormStateSerializable(node)]];
        })
    );
}

/**
 * `traverseFilterSchemaAndState` walks the *state* tree, so a stored tree with
 * fewer children than the schema goes unnoticed there and would instead blow up
 * later at render time. Check arity explicitly during rehydration, where we can
 * still fall back to a schema-derived initial state.
 */
function assertChildArityMatches(nodeType: 'and' | 'or', schemaChildCount: number, stateChildCount: number): void {
    if (schemaChildCount === stateChildCount) return;
    throw new Error(
        `Schema shape mismatch: stored '${nodeType}' state has ${stateChildCount} children but FilterExpr has ${schemaChildCount} filters`
    );
}

/**
 * Rehydrate a single filter's stored state using its schema expression.
 * Throws when the stored tree's shape no longer matches the schema (a filter
 * expression gained or lost children since the state was written). Callers are
 * expected to catch and fall back to a schema-derived initial state; see
 * `parseFilterFormState`.
 */
function rehydrateFilterStateForSchema(expression: FilterExpr, stored: FilterFormState): FilterFormState {
    return traverseFilterSchemaAndState<FilterFormState>(expression, stored, {
        leaf: (schemaLeaf, stateLeaf) => {
            const migrated = rehydrateLeafValueForSchema(schemaLeaf, stateLeaf);

            if (FilterValue.isEmpty(migrated)) {
                return { type: 'leaf', value: migrated };
            }

            const value = migrated.value;
            if (schemaLeaf.value.type === 'date' && typeof value === 'string') {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    return { type: 'leaf', value: FilterValue.value(date) };
                } else {
                    return { type: 'leaf', value: FilterValue.empty };
                }
            }

            return { type: 'leaf', value: FilterValue.value(value) };
        },
        and: (schemaAnd, stateAnd, childResults) => {
            assertChildArityMatches('and', schemaAnd.filters.length, stateAnd.children.length);
            return { type: 'and', children: childResults };
        },
        or: (schemaOr, stateOr, childResults) => {
            assertChildArityMatches('or', schemaOr.filters.length, stateOr.children.length);
            return { type: 'or', children: childResults };
        },
        not: (_schemaNot, _stateNot, childResult) => ({ type: 'not', child: childResult })
    });
}

/**
 * Parse serialized filter state (object keyed by filter id) back into a FilterState Map,
 * converting date string values to Date objects by consulting the filter schema.
 */
export function parseFilterFormState(
    serializedState: any,
    filterGroups: FilterGroups,
    missingFilterMode: FormStateInitMode = FormStateInitMode.Empty
): FilterState {
    const filters = getAllFilters(filterGroups);
    return new Map(
        filters.map(filter => {
            const raw = serializedState ? serializedState[filter.id] : undefined;
            if (raw && typeof raw === 'object' && 'type' in raw) {
                try {
                    return [filter.id, rehydrateFilterStateForSchema(filter.expression, raw as FilterFormState)];
                } catch (err) {
                    // The filter's expression changed shape since this state was written.
                    // Drop just this filter rather than failing the whole payload.
                    console.warn(`Failed to rehydrate stored state for filter "${filter.id}":`, err);
                }
            }
            // Missing, malformed or unrehydratable: no usable information for this
            // filter, so derive a fresh state from the schema. Callers persisting
            // filter state pass `WithInitialValues` here, so that a filter the stored
            // payload knows nothing about (e.g. newly added to the view) still picks up
            // its schema `initialValue` instead of silently coming back empty. Snapshot
            // consumers (saved filters, shared URLs) keep the `Empty` default so they
            // reproduce exactly what was captured.
            return [filter.id, buildInitialFormState(filter.expression, missingFilterMode)];
        })
    );
}

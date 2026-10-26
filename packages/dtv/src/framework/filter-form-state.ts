import { FilterField, FilterControl, FilterExpr, FilterGroups, FilterId, isLeaf } from './filters';
import { getAllFilters } from './view';
import { FilterState, buildInitialFormState, FormStateInitMode } from './state';
import * as FilterValue from './filterValue';
import { decode, type DecodeIssue, type Json } from './decoder';
import { undecodedFilterState, type UndecodedFilterFormState, type UndecodedFilterState, type UndecodedFilterValue } from './user-data-undecoded';
import { Result } from './result';

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

/* Encoding and decoding against the schema */

function encodeFilterFormState(node: FilterFormState): UndecodedFilterFormState {
    switch (node.type) {
        case 'leaf':
            return {
                type: 'leaf',
                value: FilterValue.isEmpty(node.value)
                    ? { type: 'empty' }
                    // Leaf values are JSON once dates are strings; JSON.stringify takes care of
                    // any date nested deeper, as in a custom operator's value.
                    : { type: 'value', value: (node.value.value instanceof Date ? node.value.value.toISOString() : node.value.value) as Json }
            };
        case 'not':
            return { type: 'not', child: encodeFilterFormState(node.child) };
        case 'and':
        case 'or':
            return { type: node.type, children: node.children.map(encodeFilterFormState) };
    }
}

/**
 * The filter state as stored: dates as ISO strings, and empty filters left out.
 * Requires schema so emptiness can be evaluated correctly.
 */
export function encodeFilterState(state: FilterState, filterGroups: FilterGroups): UndecodedFilterState {
    const filtersById = new Map(getAllFilters(filterGroups).map(f => [f.id, f] as const));

    return Object.fromEntries(
        Array.from(state.entries()).flatMap(([id, node]) => {
            const filter = filtersById.get(id);
            if (filter && isFilterEmpty(node, filter.expression)) {
                return [];
            }

            return [[id, encodeFilterFormState(node)]];
        })
    );
}

/**
 * Serialize a FilterState Map to a JSON object for persistence/sharing.
 * Requires schema so emptiness can be evaluated correctly.
 */
export function serializeFilterFormStateMap(
    state: FilterState,
    filterGroups: FilterGroups
): Record<string, any> {
    return encodeFilterState(state, filterGroups);
}

function decodeLeafValue(schemaLeaf: LeafFilterExpr, stored: UndecodedFilterValue): FilterValue.FilterValue {
    if (schemaLeaf.value.type === 'customOperator') {
        if (stored.type === 'empty') return FilterValue.empty;
        const decoded = normalizeCustomOperatorLeafValue(stored.type === 'value' ? stored.value : stored.raw);
        if (FilterValue.isValue(decoded)) {
            const { operator } = decoded.value as { operator: string };
            if (!schemaLeaf.value.operators.some(option => option.value === operator)) {
                throw new Error(`Operator "${operator}" is not one of the filter's operators`);
            }
        }
        return decoded;
    }

    const value = stored.type === 'legacy'
        ? migrateLegacyLeafValue(stored.raw, schemaLeaf)
        : stored.type === 'empty' ? FilterValue.empty : FilterValue.value(stored.value);

    if (schemaLeaf.value.type === 'date' && FilterValue.isValue(value) && typeof value.value === 'string') {
        const date = new Date(value.value);
        return isNaN(date.getTime()) ? FilterValue.empty : FilterValue.value(date);
    }

    return value;
}

/**
 * Decodes a single filter's stored state using its schema expression. Throws when the
 * stored tree's shape no longer matches the schema (the expression gained, lost or
 * reordered children since the state was written) or a value is not one the schema
 * allows. Callers catch and fall back to a schema-derived initial state; see
 * `decodeFilterState`.
 */
function decodeFilterFormState(expression: FilterExpr, stored: UndecodedFilterFormState): FilterFormState {
    switch (stored.type) {
        case 'leaf':
            if (!isLeaf(expression)) {
                throw new Error(`Schema shape mismatch: stored a leaf, FilterExpr is '${expression.type}'`);
            }
            return { type: 'leaf', value: decodeLeafValue(expression, stored.value) };
        case 'not':
            if (expression.type !== 'not') {
                throw new Error(`Schema shape mismatch: stored 'not', FilterExpr is '${expression.type}'`);
            }
            return { type: 'not', child: decodeFilterFormState(expression.filter, stored.child) };
        case 'and':
        case 'or': {
            if (expression.type !== stored.type) {
                throw new Error(`Schema shape mismatch: stored '${stored.type}', FilterExpr is '${expression.type}'`);
            }
            // A stored tree with fewer children than the schema would blow up at render time.
            if (expression.filters.length !== stored.children.length) {
                throw new Error(
                    `Schema shape mismatch: stored '${stored.type}' state has ${stored.children.length} children but FilterExpr has ${expression.filters.length} filters`
                );
            }
            return {
                type: stored.type,
                children: stored.children.map((child, index) => decodeFilterFormState(expression.filters[index], child))
            };
        }
    }
}

export type FilterStateDecoding = {
    state: FilterState;
    /** Filters whose stored state no longer fit the schema and were reset. */
    resetFilterIds: FilterId[];
};

/**
 * Decodes stored filter state against the schema. Every filter of the schema gets a
 * state; stored state for filters the schema no longer has is dropped.
 */
export function decodeFilterState(
    stored: UndecodedFilterState,
    filterGroups: FilterGroups,
    missingFilterMode: FormStateInitMode = FormStateInitMode.Empty
): FilterStateDecoding {
    const resetFilterIds: FilterId[] = [];
    const state: FilterState = new Map(
        getAllFilters(filterGroups).map(filter => {
            const storedFilter = Object.prototype.hasOwnProperty.call(stored, filter.id) ? stored[filter.id] : undefined;
            if (storedFilter !== undefined) {
                try {
                    return [filter.id, decodeFilterFormState(filter.expression, storedFilter)];
                } catch (err) {
                    // The filter's expression changed since this state was written.
                    // Reset just this filter rather than failing the whole payload.
                    console.warn(`Failed to rehydrate stored state for filter "${filter.id}":`, err);
                    resetFilterIds.push(filter.id);
                    return [filter.id, buildInitialFormState(filter.expression, missingFilterMode)];
                }
            }
            // Missing: no information for this filter, so derive a fresh state from the
            // schema. Callers persisting filter state pass `WithInitialValues` here, so that
            // a filter the stored payload knows nothing about (e.g. newly added to the view)
            // still picks up its schema `initialValue` instead of silently coming back
            // empty. Snapshot consumers (saved filters, shared URLs) keep the `Empty`
            // default so they reproduce exactly what was captured.
            return [filter.id, buildInitialFormState(filter.expression, missingFilterMode)];
        })
    );
    return { state, resetFilterIds };
}

/**
 * Parse serialized filter state (object keyed by filter id) back into a FilterState Map,
 * converting date string values to Date objects by consulting the filter schema.
 */
export function parseFilterFormState(
    serializedState: unknown,
    filterGroups: FilterGroups,
    missingFilterMode: FormStateInitMode = FormStateInitMode.Empty
): FilterState {
    const { result } = decode(undecodedFilterState, serializedState);
    const stored = Result.getOrElse<DecodeIssue, UndecodedFilterState>({}, result);
    return decodeFilterState(stored, filterGroups, missingFilterMode).state;
}

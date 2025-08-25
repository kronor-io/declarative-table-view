// Parser functions for view JSON schema types
// Separated from view.ts to avoid React import issues in tests

import type { FieldQuery, QueryConfig, OrderByConfig, Field, QueryConfigs } from './column-definition';
import type { FilterControl, FilterExpr, FilterField, FilterFieldGroup, FilterFieldSchemaFilter, FilterFieldSchema } from './filters';
import { View } from './view';
import type { Runtime } from './runtime';

// Runtime reference type for referencing components/functions from runtime
export type RuntimeReference = {
    section: 'cellRenderers' | 'noRowsComponents' | 'customFilterComponents' | 'queryTransforms';
    key: string;
};

// Helper function to resolve a runtime reference with external runtime precedence
export function resolveRuntimeReference<T>(
    reference: RuntimeReference,
    externalRuntime: Runtime | undefined,
    builtInRuntime: Runtime
): T {
    const { section, key } = reference;

    // First check external runtime if available
    if (externalRuntime && externalRuntime[section] && externalRuntime[section][key]) {
        return externalRuntime[section][key] as T;
    }

    // Fall back to built-in runtime
    if (builtInRuntime[section] && builtInRuntime[section][key]) {
        return builtInRuntime[section][key] as T;
    }

    // Component not found in either runtime
    const externalKeys = externalRuntime ? Object.keys(externalRuntime[section] || {}) : [];
    const builtInKeys = Object.keys(builtInRuntime[section] || {});
    const availableKeys = [...new Set([...externalKeys, ...builtInKeys])];

    throw new Error(
        `Component "${key}" not found in ${section}. Available keys: ${availableKeys.join(', ')}`
    );
}

// JSON Schema types - these are just aliases since the original types are already JSON-friendly
export type FieldJson = Field;
export type QueryConfigJson = QueryConfig;
export type QueryConfigsJson = QueryConfigs;
export type FieldQueryJson = FieldQuery;

// JSON Schema types for FilterControl with RuntimeReference support for custom components
export type FilterControlJson =
    | { type: 'text'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'number'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'date'; label?: string; placeholder?: string; initialValue?: any }
    | { type: 'dropdown'; label?: string; items: { label: string; value: any }[]; initialValue?: any }
    | { type: 'multiselect'; label?: string; items: { label: string; value: any }[], filterable?: boolean; initialValue?: any }
    | { type: 'customOperator'; label?: string; operators: { label: string; value: string }[]; valueControl: FilterControlJson; initialValue?: any }
    | { type: 'custom'; component: RuntimeReference; props?: Record<string, any>; label?: string; initialValue?: any };

// JSON Schema types for FilterField (multi-field support)
export type FilterFieldJson =
    | string  // Single field: "name" or "user.email"
    | { and: string[] }  // AND multiple fields: { and: ["name", "title", "description"] }
    | { or: string[] };  // OR multiple fields: { or: ["name", "title", "description"] }

// JSON Schema types for FilterExpr with transform as RuntimeReference
export type FilterExprJson =
    | { type: 'equals'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'notEquals'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'greaterThan'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'lessThan'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'greaterThanOrEqual'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'lessThanOrEqual'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'in'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'notIn'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'like'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'iLike'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'isNull'; field: FilterFieldJson; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'and'; filters: FilterExprJson[] }
    | { type: 'or'; filters: FilterExprJson[] }
    | { type: 'not'; filter: FilterExprJson };

// JSON Schema types for FilterFieldSchema components
export type FilterFieldGroupJson = FilterFieldGroup;

export type FilterFieldSchemaFilterJson = {
    label: string;
    expression: FilterExprJson;
    group: string;
    aiGenerated: boolean;
};

export type FilterFieldSchemaJson = {
    groups: FilterFieldGroupJson[];
    filters: FilterFieldSchemaFilterJson[];
};

// JSON Schema types for view definitions
export type ColumnDefinitionJson = {
    data: FieldQueryJson[]; // Array of FieldQuery objects
    name: string;   // Column display name
    cellRenderer: RuntimeReference; // Reference to cell renderer from runtime
};

export type ViewJson = {
    title: string;
    routeName: string;
    collectionName: string;
    paginationKey: string;
    columns: ColumnDefinitionJson[];
    filterSchema: FilterFieldSchemaJson;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    noRowsComponent?: RuntimeReference; // Optional reference to no-rows component from runtime
};

// Conversion functions from JSON types to actual types
export function parseRuntimeReference(json: unknown): RuntimeReference {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Invalid RuntimeReference: Expected an object');
    }

    const obj = json as Record<string, unknown>;

    if (typeof obj.section !== 'string') {
        throw new Error('Invalid RuntimeReference: "section" must be a string');
    }

    if (typeof obj.key !== 'string') {
        throw new Error('Invalid RuntimeReference: "key" must be a string');
    }

    const validSections: RuntimeReference['section'][] = ['cellRenderers', 'noRowsComponents', 'customFilterComponents', 'queryTransforms'];
    if (!validSections.includes(obj.section as RuntimeReference['section'])) {
        throw new Error(`Invalid RuntimeReference: "section" must be one of: ${validSections.join(', ')}`);
    }

    return {
        section: obj.section as RuntimeReference['section'],
        key: obj.key
    };
}

export function fieldQueryJsonToFieldQuery(json: FieldQueryJson): FieldQuery {
    if (json.type === 'field') {
        return {
            type: 'field',
            path: json.path
        };
    } else {
        return {
            type: 'queryConfigs',
            configs: json.configs.map(config => {
                const result: QueryConfig = {
                    field: config.field
                };

                if (config.orderBy !== undefined) {
                    if (Array.isArray(config.orderBy)) {
                        result.orderBy = config.orderBy.map(ob => ({
                            key: ob.key,
                            direction: ob.direction
                        } as OrderByConfig));
                    } else {
                        result.orderBy = {
                            key: config.orderBy.key,
                            direction: config.orderBy.direction
                        } as OrderByConfig;
                    }
                }

                if (config.limit !== undefined) {
                    result.limit = config.limit;
                }

                return result;
            })
        };
    }
}

// Parser functions for FieldQuery structures
function parseOrderByConfig(obj: unknown): { key: string; direction: 'ASC' | 'DESC' } {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Invalid orderBy: Expected an object');
    }

    const orderBy = obj as Record<string, unknown>;

    if (typeof orderBy.key !== 'string') {
        throw new Error('Invalid orderBy: "key" field must be a string');
    }

    if (orderBy.direction !== 'ASC' && orderBy.direction !== 'DESC') {
        throw new Error('Invalid orderBy: "direction" field must be "ASC" or "DESC"');
    }

    return {
        key: orderBy.key,
        direction: orderBy.direction as 'ASC' | 'DESC'
    };
}

function parseQueryConfigJson(obj: unknown): QueryConfigJson {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Invalid QueryConfig: Expected an object');
    }

    const config = obj as Record<string, unknown>;

    if (typeof config.field !== 'string') {
        throw new Error('Invalid QueryConfig: "field" must be a string');
    }

    const result: QueryConfigJson = {
        field: config.field
    };

    if (config.orderBy !== undefined && config.orderBy !== null) {
        if (Array.isArray(config.orderBy)) {
            result.orderBy = config.orderBy.map(parseOrderByConfig);
        } else {
            result.orderBy = parseOrderByConfig(config.orderBy);
        }
    }

    if (config.limit !== undefined && config.limit !== null) {
        if (typeof config.limit !== 'number' || config.limit < 0 || !Number.isInteger(config.limit)) {
            throw new Error('Invalid QueryConfig: "limit" must be a non-negative integer');
        }
        result.limit = config.limit;
    }

    return result;
}

function parseFieldQueryJson(obj: unknown): FieldQueryJson {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Invalid FieldQuery: Expected an object');
    }

    const fieldQuery = obj as Record<string, unknown>;

    if (fieldQuery.type === 'field') {
        if (typeof fieldQuery.path !== 'string') {
            throw new Error('Invalid Field: "path" must be a string');
        }
        return {
            type: 'field',
            path: fieldQuery.path
        };
    } else if (fieldQuery.type === 'queryConfigs') {
        if (!Array.isArray(fieldQuery.configs)) {
            throw new Error('Invalid QueryConfigs: "configs" must be an array');
        }
        return {
            type: 'queryConfigs',
            configs: fieldQuery.configs.map(parseQueryConfigJson)
        };
    } else {
        throw new Error('Invalid FieldQuery: "type" must be "field" or "queryConfigs"');
    }
}

// Parser function for ColumnDefinitionJson
export function parseColumnDefinitionJson(
    json: unknown,
    builtInRuntime: Runtime,
    externalRuntime?: Runtime
): ColumnDefinitionJson {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Invalid JSON: Expected an object');
    }

    const obj = json as Record<string, unknown>;

    // Validate required fields
    if (!Array.isArray(obj.data)) {
        throw new Error('Invalid JSON: "data" field must be an array of FieldQuery objects');
    }

    if (typeof obj.name !== 'string') {
        throw new Error('Invalid JSON: "name" field must be a string');
    }

    // Parse cellRenderer as RuntimeReference
    if (!obj.cellRenderer) {
        throw new Error('Invalid JSON: "cellRenderer" field is required');
    }

    const cellRenderer = parseRuntimeReference(obj.cellRenderer);
    if (cellRenderer.section !== 'cellRenderers') {
        throw new Error('Invalid cellRenderer: section must be "cellRenderers"');
    }

    // Parse and validate data array as FieldQuery objects
    const parsedData: FieldQueryJson[] = obj.data.map((item, index) => {
        try {
            return parseFieldQueryJson(item);
        } catch (error) {
            throw new Error(`Invalid data[${index}]: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Validate that cellRenderer key exists in at least one runtime
    const externalKeys = externalRuntime ? Object.keys(externalRuntime.cellRenderers || {}) : [];
    const builtInKeys = Object.keys(builtInRuntime.cellRenderers || {});
    const allKeys = [...new Set([...externalKeys, ...builtInKeys])];

    if (!allKeys.includes(cellRenderer.key)) {
        throw new Error(
            `Invalid cellRenderer reference: "${cellRenderer.key}". Valid keys are: ${allKeys.join(', ')}`
        );
    }

    return {
        data: parsedData,
        name: obj.name,
        cellRenderer
    };
}

// Helper function to validate FilterFieldJson
function parseFilterFieldJson(field: unknown): FilterField {
    // Handle string (single field)
    if (typeof field === 'string') {
        return field;
    }

    // Handle object (multi-field)
    if (typeof field === 'object' && field !== null && !Array.isArray(field)) {
        const obj = field as Record<string, unknown>;

        // Check for 'and' format
        if ('and' in obj) {
            if (!Array.isArray(obj.and)) {
                throw new Error('Invalid FilterField: "and" must be an array of strings');
            }
            if (!obj.and.every(item => typeof item === 'string')) {
                throw new Error('Invalid FilterField: "and" array must contain only strings');
            }
            return { and: obj.and as string[] };
        }

        // Check for 'or' format
        if ('or' in obj) {
            if (!Array.isArray(obj.or)) {
                throw new Error('Invalid FilterField: "or" must be an array of strings');
            }
            if (!obj.or.every(item => typeof item === 'string')) {
                throw new Error('Invalid FilterField: "or" array must contain only strings');
            }
            return { or: obj.or as string[] };
        }
    }

    throw new Error('Invalid FilterField: must be a string or object with "and" or "or" arrays');
}

// Parser function for FilterExprJson to FilterExpr
export function parseFilterExprJson(
    json: unknown,
    builtInRuntime: Runtime,
    externalRuntime?: Runtime
): FilterExpr {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Invalid FilterExpr: Expected an object');
    }

    const expr = json as Record<string, unknown>;

    if (typeof expr.type !== 'string') {
        throw new Error('Invalid FilterExpr: "type" must be a string');
    }

    // Handle composite expressions (and, or, not)
    if (expr.type === 'and' || expr.type === 'or') {
        if (!Array.isArray(expr.filters)) {
            throw new Error(`Invalid ${expr.type} FilterExpr: "filters" must be an array`);
        }
        return {
            type: expr.type as 'and' | 'or',
            filters: expr.filters.map(filter => parseFilterExprJson(filter, builtInRuntime, externalRuntime))
        };
    }

    if (expr.type === 'not') {
        if (!expr.filter || typeof expr.filter !== 'object') {
            throw new Error('Invalid not FilterExpr: "filter" must be an object');
        }
        return {
            type: 'not',
            filter: parseFilterExprJson(expr.filter, builtInRuntime, externalRuntime)
        };
    }

    // Handle leaf expressions
    const validLeafTypes = ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 'in', 'notIn', 'like', 'iLike', 'isNull'];
    if (!validLeafTypes.includes(expr.type)) {
        throw new Error(`Invalid FilterExpr type: "${expr.type}". Valid types are: ${validLeafTypes.join(', ')}, and, or, not`);
    }

    const parsedField = parseFilterFieldJson(expr.field);

    if (!expr.value || typeof expr.value !== 'object') {
        throw new Error('Invalid FilterExpr: "value" must be a FilterControl object');
    }

    // If the value is a custom filter control, resolve the component from runtimes
    let value: FilterControl = expr.value as FilterControl;
    if (value && value.type === 'custom') {
        // RuntimeReference-based component reference
        const componentRef = parseRuntimeReference(value.component);
        if (componentRef.section !== 'customFilterComponents') {
            throw new Error('Invalid custom filter component: section must be "customFilterComponents"');
        }

        const component = resolveRuntimeReference<any>(
            componentRef,
            externalRuntime,
            builtInRuntime
        );

        value = {
            ...value,
            component
        };
    }

    // Build the result FilterExpr
    const result: FilterExpr = {
        type: expr.type as any,
        field: parsedField,
        value
    };

    // Handle transform reference if present
    if (expr.transform) {
        const transformRef = parseRuntimeReference(expr.transform);
        if (transformRef.section !== 'queryTransforms') {
            throw new Error('Invalid transform: section must be "queryTransforms"');
        }

        const transform = resolveRuntimeReference<any>(
            transformRef,
            externalRuntime,
            builtInRuntime
        );

        (result as any).transform = transform;
    }

    return result;
}

// Parser function for FilterFieldSchemaJson
export function parseFilterFieldSchemaJson(
    json: unknown,
    builtInRuntime: Runtime,
    externalRuntime?: Runtime
): FilterFieldSchema {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Invalid FilterFieldSchema: Expected an object');
    }

    const schema = json as Record<string, unknown>;

    // Validate groups
    if (!Array.isArray(schema.groups)) {
        throw new Error('Invalid FilterFieldSchema: "groups" must be an array');
    }

    const groups: FilterFieldGroup[] = schema.groups.map((group, index) => {
        if (!group || typeof group !== 'object' || Array.isArray(group)) {
            throw new Error(`Invalid group[${index}]: Expected an object`);
        }

        const g = group as Record<string, unknown>;

        if (typeof g.name !== 'string') {
            throw new Error(`Invalid group[${index}]: "name" must be a string`);
        }

        if (g.label !== null && typeof g.label !== 'string') {
            throw new Error(`Invalid group[${index}]: "label" must be a string or null`);
        }

        return {
            name: g.name,
            label: g.label as string | null
        };
    });

    // Validate filters
    if (!Array.isArray(schema.filters)) {
        throw new Error('Invalid FilterFieldSchema: "filters" must be an array');
    }

    const filters: FilterFieldSchemaFilter[] = schema.filters.map((filter, index) => {
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw new Error(`Invalid filter[${index}]: Expected an object`);
        }

        const f = filter as Record<string, unknown>;

        if (typeof f.label !== 'string') {
            throw new Error(`Invalid filter[${index}]: "label" must be a string`);
        }

        if (typeof f.group !== 'string') {
            throw new Error(`Invalid filter[${index}]: "group" must be a string`);
        }

        if (typeof f.aiGenerated !== 'boolean') {
            throw new Error(`Invalid filter[${index}]: "aiGenerated" must be a boolean`);
        }

        if (!f.expression) {
            throw new Error(`Invalid filter[${index}]: "expression" is required`);
        }

        let expression: FilterExpr;
        try {
            expression = parseFilterExprJson(f.expression, builtInRuntime, externalRuntime);
        } catch (error) {
            throw new Error(`Invalid filter[${index}] expression: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return {
            label: f.label,
            expression,
            group: f.group,
            aiGenerated: f.aiGenerated
        };
    });

    return {
        groups,
        filters
    };
}

// Parse ViewJson into a View object with separate built-in and external runtimes
export function parseViewJson(
    json: unknown,
    builtInRuntimes: Record<string, Runtime>,
    externalRuntime?: Runtime
): View {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('View JSON must be a non-null object');
    }

    const view = json as Record<string, unknown>;

    // Validate required string fields
    if (typeof view.title !== 'string') {
        throw new Error('View "title" must be a string');
    }

    if (typeof view.routeName !== 'string') {
        throw new Error('View "routeName" must be a string');
    }

    if (typeof view.collectionName !== 'string') {
        throw new Error('View "collectionName" must be a string');
    }

    if (typeof view.paginationKey !== 'string') {
        throw new Error('View "paginationKey" must be a string');
    }

    if (typeof view.boolExpType !== 'string') {
        throw new Error('View "boolExpType" must be a string');
    }

    if (typeof view.orderByType !== 'string') {
        throw new Error('View "orderByType" must be a string');
    }

    if (typeof view.runtimeKey !== 'string') {
        throw new Error('View "runtimeKey" must be a string');
    }

    // Get the built-in runtime by key
    const builtInRuntime = builtInRuntimes[view.runtimeKey];
    if (!builtInRuntime && !externalRuntime) {
        const availableKeys = Object.keys(builtInRuntimes);
        throw new Error(`Invalid runtimeKey: "${view.runtimeKey}". Available built-in runtime keys are: ${availableKeys.join(', ')}`);
    }

    // Use empty runtime if built-in runtime is not found but external runtime exists
    const effectiveBuiltInRuntime = builtInRuntime || {
        cellRenderers: {},
        queryTransforms: {},
        noRowsComponents: {},
        customFilterComponents: {}
    };

    // Validate columns array
    if (!Array.isArray(view.columns)) {
        throw new Error('View "columns" must be an array');
    }

    // Validate filterSchema
    if (!view.filterSchema) {
        throw new Error('View "filterSchema" is required');
    }

    // Parse columns with runtime resolution
    const columnDefinitions = view.columns.map((col, index) => {
        let colJson;
        try {
            colJson = parseColumnDefinitionJson(col, effectiveBuiltInRuntime, externalRuntime);
        } catch (error) {
            throw new Error(`Invalid column[${index}]: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Convert ColumnDefinitionJson to ColumnDefinition by resolving cellRenderer
        const cellRenderer = resolveRuntimeReference<any>(
            colJson.cellRenderer,
            externalRuntime,
            effectiveBuiltInRuntime
        );

        return {
            data: colJson.data.map(fieldQueryJsonToFieldQuery),
            name: colJson.name,
            cellRenderer
        };
    });

    // Parse filter schema with runtime resolution
    let filterSchema;
    try {
        filterSchema = parseFilterFieldSchemaJson(view.filterSchema, effectiveBuiltInRuntime, externalRuntime);
    } catch (error) {
        throw new Error(`Invalid filterSchema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Parse optional noRowsComponent with runtime resolution
    let noRowsComponent;
    if (view.noRowsComponent !== undefined) {
        const noRowsRef = parseRuntimeReference(view.noRowsComponent);
        if (noRowsRef.section !== 'noRowsComponents') {
            throw new Error('Invalid noRowsComponent: section must be "noRowsComponents"');
        }

        noRowsComponent = resolveRuntimeReference<any>(
            noRowsRef,
            externalRuntime,
            builtInRuntime
        );
    }

    return {
        title: view.title,
        routeName: view.routeName,
        collectionName: view.collectionName,
        columnDefinitions,
        filterSchema,
        boolExpType: view.boolExpType as string,
        orderByType: view.orderByType as string,
        paginationKey: view.paginationKey,
        noRowsComponent
    };
}

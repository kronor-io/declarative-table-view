// Parser functions for view JSON schema types
// Separated from view.ts to avoid React import issues in tests

import type { CellRenderer, FieldQuery, QueryConfig, OrderByConfig, Field, QueryConfigs } from './column-definition';
import type { FilterControl, FilterExpr, FilterFieldGroup, FilterFieldSchemaFilter, FilterFieldSchema } from './filters';
import { View } from './view';

// JSON Schema types - these are just aliases since the original types are already JSON-friendly
export type FieldJson = Field;
export type QueryConfigJson = QueryConfig;
export type QueryConfigsJson = QueryConfigs;
export type FieldQueryJson = FieldQuery;

// JSON Schema types for FilterControl (already JSON-friendly)
export type FilterControlJson = FilterControl;

// JSON Schema types for FilterExpr with transform as string key
export type FilterExprJson =
    | { type: 'equals'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'notEquals'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'greaterThan'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'lessThan'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'greaterThanOrEqual'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'lessThanOrEqual'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'in'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'notIn'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'like'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'iLike'; key: string; value: FilterControlJson; transformKey?: string }
    | { type: 'isNull'; key: string; value: FilterControlJson; transformKey?: string }
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
export type ColumnDefinitionJson<Runtime extends { cellRenderers: Record<string, CellRenderer> }> = {
    data: FieldQueryJson[]; // Array of FieldQuery objects
    name: string;   // Column display name
    cellRendererKey: keyof Runtime['cellRenderers']; // String key to reference cell renderer from runtime
};

export type ViewJson<Runtime extends { cellRenderers: Record<string, CellRenderer> }> = {
    title: string;
    routeName: string;
    collectionName: string;
    paginationKey: string;
    columns: ColumnDefinitionJson<Runtime>[];
    filterSchema: FilterFieldSchemaJson;
    boolExpType: string; // GraphQL boolean expression type for this view
    orderByType: string; // GraphQL order by type for this view
    noRowsComponent?: string; // Optional key to reference no-rows component from runtime
};

// Conversion functions from JSON types to actual types
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

    if (config.orderBy !== undefined) {
        if (Array.isArray(config.orderBy)) {
            result.orderBy = config.orderBy.map(parseOrderByConfig);
        } else {
            result.orderBy = parseOrderByConfig(config.orderBy);
        }
    }

    if (config.limit !== undefined) {
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
export function parseColumnDefinitionJson<Runtime extends { cellRenderers: Record<string, CellRenderer> }>(
    json: unknown,
    runtime: Runtime
): ColumnDefinitionJson<Runtime> {
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

    if (typeof obj.cellRendererKey !== 'string') {
        throw new Error('Invalid JSON: "cellRendererKey" field must be a string');
    }

    // Parse and validate data array as FieldQuery objects
    const parsedData: FieldQueryJson[] = obj.data.map((item, index) => {
        try {
            return parseFieldQueryJson(item);
        } catch (error) {
            throw new Error(`Invalid data[${index}]: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Extract runtime keys and validate that cellRendererKey is valid
    const runtimeKeys = Object.keys(runtime.cellRenderers) as (keyof Runtime['cellRenderers'])[];
    if (!runtimeKeys.includes(obj.cellRendererKey as keyof Runtime['cellRenderers'])) {
        throw new Error(
            `Invalid cellRendererKey: "${obj.cellRendererKey}". Valid keys are: ${runtimeKeys.join(', ')}`
        );
    }

    return {
        data: parsedData,
        name: obj.name,
        cellRendererKey: obj.cellRendererKey as keyof Runtime['cellRenderers']
    };
}

// Parser function for FilterExprJson to FilterExpr
export function parseFilterExprJson<Runtime extends { queryTransforms: Record<string, { fromQuery: (input: any) => any; toQuery: (input: any) => any }> }>(
    json: unknown,
    runtime: Runtime
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
            filters: expr.filters.map(filter => parseFilterExprJson(filter, runtime))
        };
    }

    if (expr.type === 'not') {
        if (!expr.filter || typeof expr.filter !== 'object') {
            throw new Error('Invalid not FilterExpr: "filter" must be an object');
        }
        return {
            type: 'not',
            filter: parseFilterExprJson(expr.filter, runtime)
        };
    }

    // Handle leaf expressions
    const validLeafTypes = ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 'in', 'notIn', 'like', 'iLike', 'isNull'];
    if (!validLeafTypes.includes(expr.type)) {
        throw new Error(`Invalid FilterExpr type: "${expr.type}". Valid types are: ${validLeafTypes.join(', ')}, and, or, not`);
    }

    if (typeof expr.key !== 'string') {
        throw new Error('Invalid FilterExpr: "key" must be a string');
    }

    if (!expr.value || typeof expr.value !== 'object') {
        throw new Error('Invalid FilterExpr: "value" must be a FilterControl object');
    }

    // Build the result FilterExpr
    const result: FilterExpr = {
        type: expr.type as any,
        key: expr.key,
        value: expr.value as FilterControl
    };

    // Handle transform key if present
    if (expr.transformKey) {
        if (typeof expr.transformKey !== 'string') {
            throw new Error('Invalid FilterExpr: "transformKey" must be a string');
        }

        const transformKeys = Object.keys(runtime.queryTransforms);
        if (!transformKeys.includes(expr.transformKey)) {
            throw new Error(
                `Invalid transformKey: "${expr.transformKey}". Valid keys are: ${transformKeys.join(', ')}`
            );
        }

        (result as any).transform = runtime.queryTransforms[expr.transformKey];
    }

    return result;
}

// Parser function for FilterFieldSchemaJson
export function parseFilterFieldSchemaJson<Runtime extends { queryTransforms: Record<string, { fromQuery: (input: any) => any; toQuery: (input: any) => any }> }>(
    json: unknown,
    runtime: Runtime
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
            expression = parseFilterExprJson(f.expression, runtime);
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

// Parse ViewJson into a View object
export function parseViewJson<Runtime extends {
    cellRenderers: Record<string, CellRenderer>;
    queryTransforms: Record<string, { fromQuery: (input: any) => any; toQuery: (input: any) => any; }>;
    noRowsComponents?: Record<string, any>;
}>(
    json: unknown,
    runtime: Runtime
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

    // Validate columns array
    if (!Array.isArray(view.columns)) {
        throw new Error('View "columns" must be an array');
    }

    // Validate filterSchema
    if (!view.filterSchema) {
        throw new Error('View "filterSchema" is required');
    }
    // Parse columns
    const columnDefinitions = view.columns.map((col, index) => {
        let colJson;
        try {
            colJson = parseColumnDefinitionJson(col, runtime);
        } catch (error) {
            throw new Error(`Invalid column[${index}]: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Convert ColumnDefinitionJson to ColumnDefinition by resolving cellRendererKey to cellRenderer
        return {
            data: colJson.data.map(fieldQueryJsonToFieldQuery),
            name: colJson.name,
            cellRenderer: runtime.cellRenderers[colJson.cellRendererKey as string]
        };
    });

    // Parse filter schema
    let filterSchema;
    try {
        filterSchema = parseFilterFieldSchemaJson(view.filterSchema, runtime);
    } catch (error) {
        throw new Error(`Invalid filterSchema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Parse optional noRowsComponent
    let noRowsComponent;
    if (view.noRowsComponent !== undefined) {
        if (typeof view.noRowsComponent !== 'string') {
            throw new Error('View "noRowsComponent" must be a string');
        }

        if (!runtime.noRowsComponents || !runtime.noRowsComponents[view.noRowsComponent]) {
            throw new Error(`No-rows component "${view.noRowsComponent}" not found in runtime.noRowsComponents`);
        }

        noRowsComponent = runtime.noRowsComponents[view.noRowsComponent];
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

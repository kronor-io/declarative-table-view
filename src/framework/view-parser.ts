// Parser functions for view JSON schema types
// Separated from view.ts to avoid React import issues in tests

import type { CellRenderer, FieldQuery, QueryConfig, OrderByConfig, Field, QueryConfigs } from './column-definition';
import type { FilterControl, FilterExpr, FilterFieldGroup, FilterFieldSchemaFilter, FilterFieldSchema } from './filters';
import { View } from './view';

// Runtime reference type for referencing components/functions from runtime
export type RuntimeReference = {
    section: 'cellRenderers' | 'noRowsComponents' | 'customFilterComponents' | 'queryTransforms';
    key: string;
};

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

// JSON Schema types for FilterExpr with transform as RuntimeReference
export type FilterExprJson =
    | { type: 'equals'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'notEquals'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'greaterThan'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'lessThan'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'greaterThanOrEqual'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'lessThanOrEqual'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'in'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'notIn'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'like'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'iLike'; key: string; value: FilterControlJson; transform?: RuntimeReference }
    | { type: 'isNull'; key: string; value: FilterControlJson; transform?: RuntimeReference }
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
export function parseColumnDefinitionJson<Runtime extends { cellRenderers: Record<string, CellRenderer> }>(
    json: unknown,
    runtime: Runtime
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

    // Validate that cellRenderer key exists in runtime
    const runtimeKeys = Object.keys(runtime.cellRenderers);
    if (!runtimeKeys.includes(cellRenderer.key)) {
        throw new Error(
            `Invalid cellRenderer reference: "${cellRenderer.key}". Valid keys are: ${runtimeKeys.join(', ')}`
        );
    }

    return {
        data: parsedData,
        name: obj.name,
        cellRenderer
    };
}

// Parser function for FilterExprJson to FilterExpr
export function parseFilterExprJson<Runtime extends {
    queryTransforms: Record<string, { fromQuery: (input: any) => any; toQuery: (input: any) => any }>;
    customFilterComponents?: Record<string, any>;
}>(
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


    // If the value is a custom filter control, resolve the component from runtime.customFilterComponents
    let value: FilterControl = expr.value as FilterControl;
    if (value && value.type === 'custom') {
        // RuntimeReference-based component reference
        const componentRef = parseRuntimeReference(value.component);
        if (componentRef.section !== 'customFilterComponents') {
            throw new Error('Invalid custom filter component: section must be "customFilterComponents"');
        }

        if (!runtime.customFilterComponents || !(componentRef.key in runtime.customFilterComponents)) {
            throw new Error(`Custom filter component "${componentRef.key}" not found in runtime.customFilterComponents`);
        }

        value = {
            ...value,
            component: runtime.customFilterComponents[componentRef.key]
        };
    }

    // Build the result FilterExpr
    const result: FilterExpr = {
        type: expr.type as any,
        key: expr.key,
        value
    };

    // Handle transform reference if present
    if (expr.transform) {
        const transformRef = parseRuntimeReference(expr.transform);
        if (transformRef.section !== 'queryTransforms') {
            throw new Error('Invalid transform: section must be "queryTransforms"');
        }

        const transformKeys = Object.keys(runtime.queryTransforms);
        if (!transformKeys.includes(transformRef.key)) {
            throw new Error(
                `Invalid transform reference: "${transformRef.key}". Valid keys are: ${transformKeys.join(', ')}`
            );
        }

        (result as any).transform = runtime.queryTransforms[transformRef.key];
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
export function parseViewJson<Runtimes extends Record<string, {
    cellRenderers: Record<string, CellRenderer>;
    queryTransforms: Record<string, { fromQuery: (input: any) => any; toQuery: (input: any) => any; }>;
    noRowsComponents?: Record<string, any>;
    customFilterComponents?: Record<string, any>;
}>>(
    json: unknown,
    runtimes: Runtimes
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

    // Validate that the runtimeKey exists in the runtimes dictionary
    const runtimeKeys = Object.keys(runtimes);
    if (!runtimeKeys.includes(view.runtimeKey)) {
        throw new Error(`Invalid runtimeKey: "${view.runtimeKey}". Valid keys are: ${runtimeKeys.join(', ')}`);
    }

    // Get the specific runtime for this view
    const runtime = runtimes[view.runtimeKey as keyof Runtimes];

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

        // Convert ColumnDefinitionJson to ColumnDefinition by resolving cellRenderer to actual cellRenderer
        return {
            data: colJson.data.map(fieldQueryJsonToFieldQuery),
            name: colJson.name,
            cellRenderer: runtime.cellRenderers[colJson.cellRenderer.key]
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
        const noRowsRef = parseRuntimeReference(view.noRowsComponent);
        if (noRowsRef.section !== 'noRowsComponents') {
            throw new Error('Invalid noRowsComponent: section must be "noRowsComponents"');
        }

        if (!runtime.noRowsComponents || !runtime.noRowsComponents[noRowsRef.key]) {
            throw new Error(`No-rows component "${noRowsRef.key}" not found in runtime.noRowsComponents`);
        }
        noRowsComponent = runtime.noRowsComponents[noRowsRef.key];
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

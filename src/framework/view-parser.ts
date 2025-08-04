// Parser functions for view JSON schema types
// Separated from view.ts to avoid React import issues in tests

import type { CellRenderer, FieldQuery, QueryConfig, OrderByConfig, Field, QueryConfigs } from './column-definition';

// JSON Schema types - these are just aliases since the original types are already JSON-friendly
export type FieldJson = Field;
export type QueryConfigJson = QueryConfig;
export type QueryConfigsJson = QueryConfigs;
export type FieldQueryJson = FieldQuery;

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
    // TODO: Add filter schema, query config, etc.
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

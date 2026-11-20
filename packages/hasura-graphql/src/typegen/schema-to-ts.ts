import {
    getNamedType,
    isEnumType,
    isInterfaceType,
    isInputObjectType,
    isListType,
    isNonNullType,
    isObjectType,
    isScalarType,
    isUnionType,
    type GraphQLNamedType,
    type GraphQLSchema,
    type GraphQLType
} from 'graphql';

function safePropKey(key: string): string {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}

function singleQuoteStringLiteral(value: string): string {
    // Emit a TS string literal using single quotes.
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

export function unwrapCollectionElementType(fieldType: GraphQLType): GraphQLNamedType {
    // fieldType is usually [T!]! or [T!] etc. We want T.
    let t: GraphQLType = fieldType;
    while (isNonNullType(t)) t = t.ofType;
    if (isListType(t)) {
        t = t.ofType;
        while (isNonNullType(t)) t = t.ofType;
        return getNamedType(t);
    }
    return getNamedType(t);
}

export function collectReachableTypes(_schema: GraphQLSchema, roots: GraphQLNamedType[]): GraphQLNamedType[] {
    const queue: GraphQLNamedType[] = [...roots];
    const seen = new Set<string>();

    const add = (t: GraphQLNamedType) => {
        if (t.name.startsWith('__')) return;
        if (seen.has(t.name)) return;
        seen.add(t.name);
        queue.push(t);
    };

    for (const r of roots) {
        if (!r.name.startsWith('__')) seen.add(r.name);
    }

    const out: GraphQLNamedType[] = [];

    while (queue.length) {
        const t = queue.shift()!;
        out.push(t);

        if (isObjectType(t) || isInterfaceType(t)) {
            const fields = t.getFields();
            for (const field of Object.values(fields)) {
                const named = getNamedType(field.type);
                add(named);
            }
        } else if (isUnionType(t)) {
            for (const possible of t.getTypes()) add(possible);
        }
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type RenderTypesOptions = {
    scalars?: Record<string, string>;
    includeGraphqlTypeComments?: boolean;
    /**
     * When true, emit object fields as `readonly` and lists as `ReadonlyArray`, so code that
     * changes a row it got from the server does not compile (default false).
     */
    immutableTypes?: boolean;
};

/**
 * Renders the TypeScript declaration of one GraphQL type, e.g. `type Order = { ... };`, as
 * lines; none for a scalar, which a field renders as its mapped TypeScript type instead.
 */
function createTypeRenderer(options?: RenderTypesOptions) {
    const scalarMap: Record<string, string> = {
        ID: 'string',
        String: 'string',
        Boolean: 'boolean',
        Int: 'number',
        Float: 'number',
        json: 'any',
        jsonb: 'any',
        date: 'string',
        timestamptz: 'string',
        timestamp: 'string',
        uuid: 'string',
        ...(options?.scalars ?? {})
    };

    const renderGraphqlTypeRef = (t: GraphQLType): string => {
        if (isNonNullType(t)) return `${renderGraphqlTypeRef(t.ofType)}!`;
        if (isListType(t)) return `[${renderGraphqlTypeRef(t.ofType)}]`;
        return getNamedType(t).name;
    };

    const immutableTypes = options?.immutableTypes === true;
    const arrayType = immutableTypes ? 'ReadonlyArray' : 'Array';
    const fieldPrefix = immutableTypes ? 'readonly ' : '';

    const renderTypeRef = (t: GraphQLType): string => {
        if (!isNonNullType(t)) {
            return `${renderTypeRefNonNull(t)} | null`;
        }
        return renderTypeRefNonNull(t.ofType);
    };

    const renderTypeRefNonNull = (t: GraphQLType): string => {
        if (isNonNullType(t)) return renderTypeRefNonNull(t.ofType);
        if (isListType(t)) return `${arrayType}<${renderTypeRef(t.ofType)}>`;

        const named = getNamedType(t);
        if (isScalarType(named)) {
            return scalarMap[named.name] ?? 'unknown';
        }
        return named.name;
    };

    const includeGraphqlTypeComments = options?.includeGraphqlTypeComments === true;

    const renderFields = (fields: Record<string, { name: string; type: GraphQLType }>): string[] => {
        const lines: string[] = [];
        for (const field of Object.values(fields)) {
            if (field.name.startsWith('__')) continue;
            const key = safePropKey(field.name);
            const tsType = renderTypeRef(field.type);
            if (includeGraphqlTypeComments) {
                lines.push(`    ${fieldPrefix}${key}: ${tsType}; // GraphQL: ${renderGraphqlTypeRef(field.type)}`);
            } else {
                lines.push(`    ${fieldPrefix}${key}: ${tsType};`);
            }
        }
        return lines;
    };

    return (t: GraphQLNamedType, typePrefix: string): string[] => {
        const typeName = t.name;
        if (t.name.startsWith('__') || isScalarType(t)) return [];

        if (isEnumType(t)) {
            const values = t.getValues().map(v => singleQuoteStringLiteral(v.name)).join(' | ');
            return [`${typePrefix} ${typeName} = ${values || 'never'};`];
        }

        if (isUnionType(t)) {
            const members = t.getTypes().map(m => m.name).join(' | ');
            return [`${typePrefix} ${typeName} = ${members || 'never'};`];
        }

        if (isObjectType(t) || isInterfaceType(t) || isInputObjectType(t)) {
            // Input objects are not expected in reachable output types, but keep deterministic behavior.
            return [`${typePrefix} ${typeName} = {`, ...renderFields(t.getFields()), '};'];
        }

        return [`${typePrefix} ${typeName} = unknown;`];
    };
}

export function renderTsFromSchema(
    types: GraphQLNamedType[],
    options?: RenderTypesOptions & {
        /**
         * When true (default), emit `export type ...` declarations.
         * When false, emit local `type ...` declarations.
         */
        exportTypes?: boolean;
    }
): string {
    const renderType = createTypeRenderer(options);
    const typePrefix = options?.exportTypes !== false ? 'export type' : 'type';

    const chunks: string[] = [];
    chunks.push('/* eslint-disable @typescript-eslint/no-unused-vars */');
    chunks.push('// This file is auto-generated by `dtv typegen`.');
    chunks.push('// Do not edit manually.');
    chunks.push('');

    for (const t of types) {
        const declaration = renderType(t, typePrefix);
        if (declaration.length === 0) continue;
        chunks.push(...declaration, '');
    }

    return chunks.join('\n');
}

/**
 * The named types `t` declares its fields or members with that a module declaring `t` has to
 * import: every one but scalars (rendered as TypeScript types), introspection types and `t` itself.
 */
export function referencedTypeNames(t: GraphQLNamedType): string[] {
    const names = new Set<string>();
    const add = (named: GraphQLNamedType) => {
        if (named.name === t.name || named.name.startsWith('__') || isScalarType(named)) return;
        names.add(named.name);
    };

    if (isObjectType(t) || isInterfaceType(t)) {
        for (const field of Object.values(t.getFields())) {
            if (field.name.startsWith('__')) continue;
            add(getNamedType(field.type));
        }
    } else if (isInputObjectType(t)) {
        for (const field of Object.values(t.getFields())) add(getNamedType(field.type));
    } else if (isUnionType(t)) {
        for (const member of t.getTypes()) add(member);
    }

    return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * A module declaring one GraphQL type, `export type <Name> = ...`, that imports the types it
 * references from their own modules: `importPath(name)` says from where, e.g. `./Customer`.
 * Returns null for a type that gets no declaration (scalars, introspection types).
 */
export function renderTypeModule(
    t: GraphQLNamedType,
    importPath: (typeName: string) => string,
    options?: RenderTypesOptions
): string | null {
    const declaration = createTypeRenderer(options)(t, 'export type');
    if (declaration.length === 0) return null;

    const imports = referencedTypeNames(t)
        .map(name => `import type { ${name} } from ${singleQuoteStringLiteral(importPath(name))};`);

    return [
        '// This file is auto-generated by `dtv typegen`.',
        '// Do not edit manually.',
        '',
        ...(imports.length ? [...imports, ''] : []),
        ...declaration,
        ''
    ].join('\n');
}

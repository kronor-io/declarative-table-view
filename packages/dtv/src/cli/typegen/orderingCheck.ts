import { getNamedType, isObjectType, type GraphQLNamedType, type GraphQLSchema } from 'graphql';
import { loadDefinitionsConfig } from '../config/loadConfig.js';
import { loadProject } from '../definitions/loadProject.js';

/*
 * A column whose data is a single scalar field is sorted by that field unless it says
 * otherwise, and a column can name any field it selects. GraphQL orders by a JSON field
 * as readily as by any other, but the order means nothing to a user, and an export that
 * pages through the rows by the sorted field cannot page by a JSON value. So the typegen,
 * which has the schema, fails on every column sorted by one. The fix is
 * `orderBy: Orderable.notOrderable`, or sorting by a scalar field.
 */

/** The scalars a column cannot be sorted by. */
export const UNORDERABLE_SCALARS: ReadonlySet<string> = new Set(['json', 'jsonb']);

export type ColumnsOrdering = Readonly<Record<string, { readonly orderBy: string | null }>>;

/** What the typegen needs of the project's views: the field each column of a view is sorted by. */
export type ColumnOrdering = {
    /** A view's columns and the field each is sorted by (null: it cannot be sorted); undefined when the view could not be built. */
    columnsOf(viewId: string): ColumnsOrdering | undefined;
    close(): Promise<void>;
};

export type UnorderableColumn = {
    viewId: string;
    columnId: string;
    orderBy: string;
    scalar: string;
};

/**
 * The type a dotted path through the row ends in, or null when the schema has no such
 * path: a field the row does not have is not this check's to report.
 */
export function orderByTypeOf(schema: GraphQLSchema, rowTypeName: string, orderBy: string): GraphQLNamedType | null {
    let type: GraphQLNamedType | undefined = schema.getType(rowTypeName) ?? undefined;
    for (const field of orderBy.split('.')) {
        if (!type || !isObjectType(type)) return null;
        const definition = type.getFields()[field];
        if (!definition) return null;
        type = getNamedType(definition.type);
    }
    return type ?? null;
}

export function findUnorderableColumns(
    schema: GraphQLSchema,
    views: readonly { viewId: string; rowTypeName: string; columns: ColumnsOrdering }[]
): UnorderableColumn[] {
    return views.flatMap(({ viewId, rowTypeName, columns }) =>
        Object.entries(columns).flatMap(([columnId, { orderBy }]) => {
            if (orderBy === null) return [];
            const type = orderByTypeOf(schema, rowTypeName, orderBy);
            return type !== null && UNORDERABLE_SCALARS.has(type.name)
                ? [{ viewId, columnId, orderBy, scalar: type.name }]
                : [];
        }));
}

export function describeUnorderableColumns(columns: readonly UnorderableColumn[]): string {
    return [
        'Columns sorted by a JSON field:',
        ...columns.map(c => `- ${c.viewId}: column ${JSON.stringify(c.columnId)} sorts by ${JSON.stringify(c.orderBy)} (${c.scalar})`),
        'A JSON field has no meaningful order, and an export cannot page through the rows by it. '
            + 'Set `orderBy: Orderable.notOrderable` on the column, or sort it by a scalar field.'
    ].join('\n');
}

/** The views as `dtv definitions` builds them: through the project's own Vite. */
export async function loadColumnOrdering(configPath: string): Promise<ColumnOrdering> {
    const config = await loadDefinitionsConfig(configPath);
    const project = await loadProject({ cwd: process.cwd(), config });
    return {
        columnsOf: viewId => {
            if (project.definitions[viewId] === undefined) return undefined;
            try {
                return project.projectDefinition(viewId, 1).columns;
            } catch {
                return undefined;
            }
        },
        close: () => project.close()
    };
}

import { deepEqual } from './generate.js';
import type { LoadedDefinition, LoadedView, ViewProjection } from './types.js';

/*
 * From the views built of each export to the project's view definitions. A factory is
 * built twice, with minimal and with contrasting arguments (see ./discover), and the two
 * views tell what its arguments change:
 *
 * - the filters: then which of them to snapshot is not ours to guess, and its arguments
 *   have to be configured;
 * - the id: fine when the contrasting id only adds a suffix to the minimal one (`asset-list`,
 *   `asset-list-1`), which is the definition id then; otherwise its definition id has to
 *   be configured;
 * - the columns (e.g. one shown only when a callback is passed): the snapshot gets them all.
 */

export type BuiltExport = {
    /** How to name the export to the user, e.g. `historyDtvView (src/history.ts)`. */
    label: string;
    /** The key to configure it under in `definitions.factories`. */
    configKey: string;
    source: string;
    /** The definition id configured for it. */
    definition?: string;
    /** Built with arguments made up from the parameter types, rather than configured ones. */
    generated: boolean;
    /** Its views: the minimal one first; a constant or configured factory has one. */
    builds: Array<{ view: LoadedView } | { error: string }>;
};

export type Definitions = {
    definitions: Record<string, LoadedDefinition>;
    problems: string[];
};

type Projector = (view: LoadedView, definition: string) => ViewProjection;

const differingFilters = (left: ViewProjection, right: ViewProjection) =>
    Object.keys({ ...left.filters, ...right.filters }).filter(id => !deepEqual(left.filters[id], right.filters[id]));

export function resolveDefinitions(built: readonly BuiltExport[], project: Projector): Definitions {
    const definitions: Record<string, LoadedDefinition> = {};
    const problems: string[] = [];
    const configure = (item: BuiltExport, what: string) => `configure ${what} in definitions.factories["${item.configKey}"]`;

    for (const item of built) {
        const [first, ...others] = item.builds;
        if ('error' in first) {
            problems.push(item.generated
                ? `${item.label}: cannot be built with arguments made up from its parameter types (${first.error}); ${configure(item, 'its args')}`
                : `${item.label}: cannot be built with its configured args (${first.error})`);
            continue;
        }
        // A contrasting build that fails only means fewer contrasts to tell what the arguments change.
        const views = [first.view, ...others.flatMap(build => 'view' in build ? [build.view] : [])];

        let definition = item.definition;
        if (definition === undefined) {
            const [minimal, ...rest] = views.map(view => view.id);
            const derived = rest.every(id => id === minimal || (minimal !== '' && !minimal.startsWith('-') && id.startsWith(`${minimal}-`)));
            if (!derived) {
                problems.push(`${item.label}: its view id depends on its arguments (${[minimal, ...rest].join(', ')}); ${configure(item, 'its definition id')}`);
                continue;
            }
            definition = minimal;
        }

        const projections = views.map(view => project(view, definition as string));
        const varying = projections.slice(1).flatMap(projection => differingFilters(projections[0], projection));
        if (varying.length > 0) {
            problems.push(`${item.label}: its arguments change its filters (${[...new Set(varying)].join(', ')}); ${configure(item, 'the args to snapshot it with')}`);
            continue;
        }

        const existing = definitions[definition];
        if (existing === undefined) {
            definitions[definition] = { instances: views, source: item.source };
        } else if (differingFilters(project(existing.instances[0], definition), projections[0]).length === 0) {
            definitions[definition] = { ...existing, instances: [...existing.instances, ...views] };
        } else {
            problems.push(`${item.label}: makes views of "${definition}" whose filters differ from another export's`);
        }
    }

    return { definitions, problems };
}

/** The projection of a definition: its instances' filters (which agree) and all their columns. */
export function projectDefinition(definition: LoadedDefinition, id: string, revision: number, project: (view: LoadedView, definition: string, revision: number) => ViewProjection): ViewProjection {
    const [first, ...rest] = definition.instances.map(view => project(view, id, revision));
    return rest.reduce((merged, projection) => ({
        ...merged,
        columns: { ...merged.columns, ...Object.fromEntries(Object.entries(projection.columns).filter(([column]) => merged.columns[column] === undefined)) }
    }), first);
}

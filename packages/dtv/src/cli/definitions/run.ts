import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
    deepEqual,
    generateOps,
    migrationFile,
    renderIndex,
    renderMigration,
    renderSnapshot,
    snapshotFile
} from './generate.js';
import { renameMigrationsImport, wireMigrations } from './wire.js';
import { MIGRATIONS_FOLDER, type LoadedView, type ViewMigrationChain, type ViewProjection, type DefinitionsProject } from './types.js';

export type DefinitionsOptions = {
    cwd: string;
    /**
     * Where the migrations of a view go when its source file cannot be found (JSON views,
     * ids that are not literals): `<migrationsDir>/<definition>`.
     */
    migrationsDir: string;
    dtvImport: string;
    log: (line: string) => void;
};

export type MigrateOptions = DefinitionsOptions & {
    /** Only this definition. */
    definition?: string;
    /** Make a revision even though the definition did not change, for the reason given. */
    manual?: string;
    /** The definition's previous id: its folder is taken over. */
    renamedFrom?: string;
};

/*
 * Where a definition's migrations are. A view that uses its migrations imports them, so
 * the folder is the one whose index module exports the very chain the view has —
 * wherever it was moved. A view that does not use them yet has them in the
 * `dtv-migrations/<definition>` folder; a new one gets that folder next to the view's
 * source file.
 */

type Located =
    | { kind: 'imported'; folder: string; chain: ViewMigrationChain }
    | { kind: 'unwired'; folder: string; chain: ViewMigrationChain | null }
    | { kind: 'problem'; message: string };

type Chains = Map<string, ViewMigrationChain | null>;

async function loadChains(project: DefinitionsProject): Promise<Chains> {
    const folders = await project.findChainFolders();
    return new Map(await Promise.all(folders.map(async folder => [folder, await project.loadChain(folder)] as const)));
}

const relative = (options: DefinitionsOptions, file: string) => path.relative(options.cwd, file).split(path.sep).join('/');

async function locate(options: DefinitionsOptions, project: DefinitionsProject, chains: Chains, definition: string, view: LoadedView): Promise<Located> {
    if (view.migrations !== undefined) {
        for (const [folder, chain] of chains) {
            if (chain === view.migrations) return { kind: 'imported', folder, chain };
        }
        return { kind: 'problem', message: `${definition}: the view uses migrations that are not in a ${MIGRATIONS_FOLDER}/<definition> folder` };
    }

    const named = [...chains.keys()].filter(folder => path.basename(folder) === definition);
    if (named.length > 1) {
        return { kind: 'problem', message: `${definition}: several migration folders and the view uses none of them: ${named.map(folder => relative(options, folder)).join(', ')}` };
    }
    if (named.length === 1) return { kind: 'unwired', folder: named[0], chain: chains.get(named[0]) ?? null };

    const source = project.definitions[definition]?.source ?? null;
    const parent = source === null ? path.resolve(options.cwd, options.migrationsDir) : path.join(path.dirname(source), MIGRATIONS_FOLDER);
    return { kind: 'unwired', folder: path.join(parent, definition), chain: null };
}

function sameDefinition(live: ViewProjection, latest: ViewProjection): boolean {
    return live.definition === latest.definition && deepEqual(live.filters, latest.filters) && deepEqual(live.columns, latest.columns);
}

/** The migration revisions a folder has files for, oldest first. */
async function migrationRevisions(folder: string): Promise<number[]> {
    const files = await fs.readdir(folder).catch(() => [] as string[]);
    return files
        .map(file => /^v(\d+)\.ts$/.exec(file))
        .flatMap(match => match === null ? [] : [Number(match[1])])
        .sort((left, right) => left - right);
}

function camelCase(definition: string): string {
    return definition.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string | undefined) => (next ?? '').toUpperCase()).replace(/^[^A-Za-z_$]/, '_$&');
}

/**
 * Wires the view of a definition up with its migrations in `folder` (see ./wire): edits its
 * module, or says what to add where it cannot. Returns what to tell the user.
 */
async function wireUp(options: DefinitionsOptions, project: DefinitionsProject, definition: string, folder: string): Promise<string[]> {
    const source = project.definitions[definition]?.source ?? null;
    const from = source === null ? options.cwd : path.dirname(source);
    const relativeFolder = path.relative(from, folder).split(path.sep).join('/');
    const specifier = relativeFolder.startsWith('../') ? relativeFolder : `./${relativeFolder}`;

    let reason = 'its module is not known, as for a JSON view';
    if (source !== null) {
        const wiring = wireMigrations(await fs.readFile(source, 'utf8'), source, definition, specifier, options.dtvImport);
        if (wiring.kind === 'wired') {
            await fs.writeFile(source, wiring.text, 'utf8');
            return [`  Wired it up in ${relative(options, source)}`];
        }
        reason = wiring.reason;
    }

    const name = `${camelCase(definition)}Migrations`;
    return [
        source === null
            ? `  Wire it up in the view definition of "${definition}" (${reason}; the path is from ${options.cwd}):`
            : `  Wire it up in ${relative(options, source)} (${reason}):`,
        `    import ${name} from '${specifier}';`,
        `    DSL.view({ …, migrations: ${name} })`
    ];
}

async function writeFile(file: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
}

/**
 * Writes a new revision for each definition whose projection changed since its latest
 * snapshot, and a first snapshot for definitions without one. Returns the number of
 * decisions left open (`todo`).
 *
 * Views that could not be made definitions of are left alone and returned as problems.
 */
export async function runMigrate(options: MigrateOptions, project: DefinitionsProject): Promise<{ todos: number; problems: readonly string[] }> {
    const definitions = options.definition === undefined ? Object.keys(project.definitions) : [options.definition];
    if (options.definition !== undefined && project.definitions[options.definition] === undefined) {
        throw new Error(`No view definition "${options.definition}"; there are ${Object.keys(project.definitions).join(', ')}`);
    }
    if ((options.manual !== undefined || options.renamedFrom !== undefined) && options.definition === undefined) {
        throw new Error('--manual and --renamed-from need the definition they are for');
    }

    let chains = await loadChains(project);
    /** The folder taken over from a renamed definition: the view still imports it from where it was. */
    let renamedFolder: string | null = null;

    if (options.renamedFrom !== undefined) {
        const renamedFrom = options.renamedFrom;
        const previous = [...chains.keys()].filter(folder => path.basename(folder) === renamedFrom);
        if (previous.length !== 1) {
            throw new Error(`Cannot take over "${renamedFrom}": ${previous.length === 0 ? 'no' : 'several'} ${MIGRATIONS_FOLDER}/${renamedFrom} folders`);
        }
        const folder = path.join(path.dirname(previous[0]), options.definition as string);
        if (await fs.access(folder).then(() => true, () => false)) {
            throw new Error(`Cannot take over "${renamedFrom}": ${relative(options, folder)} exists already`);
        }
        await fs.rename(previous[0], folder);
        options.log(`${options.definition}: took over ${relative(options, previous[0])}, now ${relative(options, folder)}`);
        chains = await loadChains(project);
        renamedFolder = folder;

        // The view imports the folder by its old name.
        const source = project.definitions[options.definition as string]?.source ?? null;
        const renamedImport = source === null ? null : renameMigrationsImport(await fs.readFile(source, 'utf8'), renamedFrom, options.definition as string);
        if (source !== null && renamedImport !== null) {
            await fs.writeFile(source, renamedImport, 'utf8');
            options.log(`  Updated the import in ${relative(options, source)}`);
        } else if (project.definitions[options.definition as string]?.instances[0].migrations !== undefined) {
            options.log(`  Update the import of its migrations in its view definition to ${relative(options, folder)}`);
        }
    }

    let todos = 0;
    /** Definitions without changes; counted rather than listed when all definitions are snapshotted. */
    let upToDate = 0;
    for (const definition of definitions) {
        const view = project.definitions[definition].instances[0];
        const renamedChain = renamedFolder === null ? null : chains.get(renamedFolder) ?? null;
        const located: Located = renamedFolder !== null && definition === options.definition
            ? (view.migrations !== undefined && renamedChain !== null
                ? { kind: 'imported', folder: renamedFolder, chain: renamedChain }
                : { kind: 'unwired', folder: renamedFolder, chain: renamedChain })
            : await locate(options, project, chains, definition, view);
        if (located.kind === 'problem') throw new Error(located.message);
        const { folder, chain } = located;

        if (chain === null) {
            const baseline = project.projectDefinition(definition, 1);
            await writeFile(path.join(folder, snapshotFile(1)), renderSnapshot(baseline, options.dtvImport));
            await writeFile(path.join(folder, 'index.ts'), renderIndex({ baselineRevision: 1, migrationRevisions: [], dtvImport: options.dtvImport }));
            options.log(`${definition}: first snapshot, revision 1, in ${relative(options, folder)}`);
            (await wireUp(options, project, definition, folder)).forEach(options.log);
            continue;
        }

        const latest = chain.latest;
        const revision = latest.revision + 1;
        const live = project.projectDefinition(definition, revision);
        if (sameDefinition(live, latest) && options.manual === undefined) {
            // Only worth a line of its own when asked for, or when it is wired up now.
            if (options.definition === undefined && located.kind !== 'unwired') {
                upToDate++;
                continue;
            }
            options.log(`${definition}: up to date at revision ${latest.revision}`);
            if (located.kind === 'unwired') (await wireUp(options, project, definition, folder)).forEach(options.log);
            continue;
        }

        const ops = generateOps(latest, live);
        const open = ops.filter(op => op.todo).length + (options.manual === undefined ? 0 : 1);
        todos += open;

        await writeFile(path.join(folder, snapshotFile(revision)), renderSnapshot(live, options.dtvImport));
        await writeFile(path.join(folder, migrationFile(revision)), renderMigration({
            fromRevision: latest.revision,
            toRevision: revision,
            ops,
            dtvImport: options.dtvImport,
            manualReason: options.manual
        }));
        await writeFile(path.join(folder, 'index.ts'), renderIndex({
            baselineRevision: chain.baseline.revision,
            migrationRevisions: [...new Set([...(await migrationRevisions(folder)), revision])].sort((left, right) => left - right),
            dtvImport: options.dtvImport
        }));

        const migration = relative(options, path.join(folder, migrationFile(revision)));
        options.log(`${definition}: revision ${revision}, ${ops.length} operation(s)${open > 0 ? `, ${open} to decide in ${migration}` : ''}`);
        if (located.kind === 'unwired') (await wireUp(options, project, definition, folder)).forEach(options.log);
    }

    if (upToDate > 0) options.log(`${upToDate} ${upToDate === 1 ? 'view' : 'views'} up to date`);

    return { todos, problems: project.problems };
}

export type CheckReport = { problems: string[]; warnings: string[] };

/**
 * Whether every view's stored user data can be migrated to its definition as it is: each
 * view uses its migrations, its latest snapshot is the definition as it is, and each
 * migration covers its revision's changes and has no `todo` left.
 */
export async function runCheck(options: DefinitionsOptions, project: DefinitionsProject): Promise<CheckReport> {
    const problems: string[] = [];
    const warnings: string[] = [];
    const chains = await loadChains(project);
    const used = new Set<string>();

    problems.push(...project.problems);

    for (const [definition, { instances: [view] }] of Object.entries(project.definitions)) {
        const located = await locate(options, project, chains, definition, view);
        if (located.kind === 'problem') {
            problems.push(located.message);
            continue;
        }
        used.add(located.folder);
        if (located.kind === 'unwired') {
            problems.push(located.chain === null
                ? `${definition}: no snapshots; run \`dtv definitions snapshot ${definition}\``
                : `${definition}: the view does not use its migrations in ${relative(options, located.folder)}`);
            continue;
        }

        const { chain } = located;
        for (const migration of chain.migrations) {
            for (const problem of project.tooling.checkMigration(migration)) {
                problems.push(`${definition}: ${problem.message}`);
            }
        }

        if (chain.latest.definition !== definition) {
            problems.push(`${definition}: the view uses the migrations of "${chain.latest.definition}"`);
            continue;
        }
        const live = project.projectDefinition(definition, chain.latest.revision);
        if (!sameDefinition(live, chain.latest)) {
            problems.push(`${definition}: changed since revision ${chain.latest.revision}; run \`dtv definitions snapshot ${definition}\``);
        }
    }

    for (const folder of chains.keys()) {
        if (!used.has(folder)) {
            warnings.push(`${relative(options, folder)}: migrations no view uses (renamed? \`dtv definitions snapshot <new id> --renamed-from ${path.basename(folder)}\`)`);
        }
    }

    return { problems, warnings };
}

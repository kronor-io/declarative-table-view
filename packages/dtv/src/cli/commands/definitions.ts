import type { Command } from 'commander';
import { loadDefinitionsConfig, type DtvDefinitionsConfig } from '../config/loadConfig.js';
import { loadProject } from '../definitions/loadProject.js';
import { runCheck, runMigrate, type DefinitionsOptions } from '../definitions/run.js';
import type { DefinitionsProject } from '../definitions/types.js';

type CommonOpts = { config: string; viteConfig?: string; migrationsDir?: string };

function withCommonOptions(command: Command): Command {
    return command
        .option('-c, --config <path>', 'Path to dtv.config.ts (its `scan` finds the views, its `definitions` configures this command)', 'dtv.config.ts')
        .option('--vite-config <path>', 'Vite config to load the views with, over definitions.viteConfig (default: vite.config.* in the working directory)')
        .option('-d, --migrations-dir <path>', 'Where migrations go for views whose module is not found, over definitions.migrationsDir (default: dtv-migrations)');
}

async function withProject<T>(opts: CommonOpts, run: (project: DefinitionsProject, options: DefinitionsOptions) => Promise<T>): Promise<T> {
    const config: DtvDefinitionsConfig = await loadDefinitionsConfig(opts.config);
    const project = await loadProject({ cwd: process.cwd(), config, viteConfig: opts.viteConfig });
    try {
        return await run(project, {
            cwd: process.cwd(),
            migrationsDir: opts.migrationsDir ?? config.definitions.migrationsDir ?? 'dtv-migrations',
            dtvImport: config.scan.dtvImport,
            log: line => console.log(line)
        });
    } finally {
        await project.close();
    }
}

function fail(e: unknown): void {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
}

export function registerDefinitionsCommand(program: Command) {
    const definitions = program
        .command('definitions')
        .description('Snapshots of view definitions, and migrations of the user data stored for them');

    withCommonOptions(definitions
        .command('snapshot')
        .description('Snapshot changed view definitions and write the migrations of their user data')
        .argument('[definition]', 'Only this definition')
        .option('--manual <reason>', 'Make a revision without a change of the definition, e.g. for renamed enum values')
        .option('--renamed-from <definition>', 'The definition was renamed from this id: take over its migrations'))
        .action(async (definition: string | undefined, opts: CommonOpts & { manual?: string; renamedFrom?: string }) => {
            try {
                const { todos, problems } = await withProject(opts, (project, options) => runMigrate({
                    ...options,
                    definition,
                    manual: opts.manual,
                    renamedFrom: opts.renamedFrom
                }, project));
                if (todos > 0) {
                    console.log(`\n${todos} decision(s) left as m.todo(…); replace them, then run \`dtv definitions check\`.`);
                }
                if (problems.length > 0) {
                    console.error(`\nViews left out:\n${problems.map(problem => `  ${problem}`).join('\n')}`);
                    process.exitCode = 1;
                }
            } catch (e) {
                fail(e);
            }
        });

    withCommonOptions(definitions
        .command('check')
        .description('Fail when a view definition changed without a migration, or a migration is incomplete'))
        .action(async (opts: CommonOpts) => {
            try {
                const report = await withProject(opts, (project, options) => runCheck(options, project));
                report.warnings.forEach(warning => console.warn(`warning: ${warning}`));
                report.problems.forEach(problem => console.error(problem));
                if (report.problems.length > 0) process.exitCode = 1;
                else console.log('View migrations are complete.');
            } catch (e) {
                fail(e);
            }
        });
}

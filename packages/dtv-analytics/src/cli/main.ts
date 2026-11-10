import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { composeFile, serverConfig, type ComposeOptions } from './compose.js';
import { bundleDefinitions, findChains } from './definitions.js';
import { CONFIG_FILE, loadConfig } from './loadConfig.js';

/*
 * `dtv-analytics`, run in the host's repository:
 *
 *   dtv-analytics up [--source <name>]     bundles the definitions and starts the source's server
 *   dtv-analytics down [--source <name>]   stops it; --purge also deletes what it fetched
 *   dtv-analytics bundle                   only bundles the definitions
 *
 * Everything it writes goes to .dtv-analytics/ (or --out).
 */

const USAGE = [
    'Usage:',
    '  dtv-analytics up [--source <name>] [--port <port>] [--hasura-port <port>] [--image <image>]',
    '  dtv-analytics down [--source <name>] [--purge]',
    '  dtv-analytics bundle',
    '',
    'Options for all: --root <folder> (the host, default the current folder), --out <folder> (default <root>/.dtv-analytics),',
    `  --config <file> (default <root>/${CONFIG_FILE})`,
].join('\n');

const VERSION = '0.1.0';
const DEFAULT_IMAGE = `ghcr.io/kronor-io/dtv-analytics-server:${VERSION}`;

function option(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
}

type Context = { root: string; out: string; configFile: string | undefined; args: string[] };

async function bundle({ root, out, configFile }: Context): Promise<void> {
    const config = await loadConfig(root, configFile);
    const chains = await findChains(root, config?.definitions?.include, config?.definitions?.exclude);
    const result = await bundleDefinitions(root, chains, out);
    console.log(`Bundled ${result.definitions.length} definitions into ${result.bundle}`);
}

/** The project of the source named, or of the first one. */
async function composeOptions({ root, out, configFile, args }: Context): Promise<ComposeOptions> {
    const config = await loadConfig(root, configFile);
    if (config === undefined) {
        throw new Error(`${configFile ?? path.join(root, CONFIG_FILE)} does not exist`);
    }
    const names = Object.keys(config.sources);
    const sourceName = option(args, '--source') ?? names[0];
    const source = sourceName === undefined ? undefined : config.sources[sourceName];
    if (sourceName === undefined || source === undefined) {
        throw new Error(`No source ${sourceName ?? ''} in ${CONFIG_FILE}; it has ${names.join(', ') || 'none'}`);
    }
    const port = Number(option(args, '--port') ?? 4310);
    return {
        host: path.basename(root),
        sourceName,
        source,
        workDir: out,
        image: option(args, '--image') ?? DEFAULT_IMAGE,
        port,
        hasuraPort: Number(option(args, '--hasura-port') ?? port + 1),
    };
}

function compose(file: string, args: string[]): void {
    const result = spawnSync('docker', ['compose', '-f', file, ...args], { stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error(`docker compose ${args.join(' ')} failed`);
    }
}

async function up(context: Context): Promise<void> {
    await bundle(context);
    const options = await composeOptions(context);
    const folder = path.join(context.out, options.sourceName);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'config.json'), `${JSON.stringify(serverConfig(options), null, 2)}\n`);
    const file = path.join(folder, 'compose.json');
    await fs.writeFile(file, `${JSON.stringify(composeFile(options), null, 2)}\n`);
    compose(file, ['up', '-d', '--wait']);
    console.log(`DTV analytics of ${options.sourceName}: http://localhost:${options.port}`);
}

async function down(context: Context): Promise<void> {
    const options = await composeOptions(context);
    compose(path.join(context.out, options.sourceName, 'compose.json'), ['down', ...(context.args.includes('--purge') ? ['--volumes'] : [])]);
}

async function main(args: string[]): Promise<void> {
    const root = path.resolve(option(args, '--root') ?? process.cwd());
    const configFile = option(args, '--config');
    const context = {
        root,
        out: path.resolve(option(args, '--out') ?? path.join(root, '.dtv-analytics')),
        configFile: configFile === undefined ? undefined : path.resolve(configFile),
        args,
    };
    switch (args[0]) {
        case 'up':
            return up(context);
        case 'down':
            return down(context);
        case 'bundle':
            return bundle(context);
        default:
            console.error(USAGE);
            process.exitCode = 1;
    }
}

try {
    await main(process.argv.slice(2));
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}

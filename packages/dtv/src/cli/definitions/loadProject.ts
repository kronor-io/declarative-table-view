import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DtvDefinitionsConfig } from '../config/loadConfig.js';
import { buildProject } from './project.js';
import type { DefinitionsProject } from './types.js';

/*
 * `dtv definitions` evaluates the project's view definitions, which import what the project's
 * bundler resolves (path aliases, styles, `?raw` files, …). So they are loaded through the
 * project's own Vite, with its config, the way its dev server would load them for SSR.
 * The projecting and checking functions come from the project's own @kronor/dtv, through
 * the same module graph: the very code its app runs.
 *
 * Which views there are, and how they are built, is ./project's; this module provides the
 * loading.
 */

export type LoadProjectArgs = {
    cwd: string;
    config: DtvDefinitionsConfig;
    /** Vite config file, over the config's; looked for in `cwd` when neither gives one. */
    viteConfig?: string;
};

type ViteServer = {
    ssrLoadModule(url: string): Promise<Record<string, unknown>>;
    close(): Promise<void>;
};

type Vite = { createServer(config: Record<string, unknown>): Promise<ViteServer> };

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];


async function exists(file: string): Promise<boolean> {
    return fs.access(file).then(() => true, () => false);
}

async function importProjectVite(cwd: string): Promise<Vite> {
    let resolved: string;
    try {
        resolved = createRequire(path.join(cwd, 'package.json')).resolve('vite');
    } catch {
        throw new Error('`dtv definitions` loads the views with the project\'s Vite, but `vite` cannot be resolved from ' + cwd);
    }
    return await import(pathToFileURL(resolved).href) as Vite;
}

type Jsdom = { JSDOM: new (html: string, options: Record<string, unknown>) => { window: Record<string, unknown> & { close(): void } } };

/**
 * View modules are browser code, and some touch browser globals as they are imported
 * (e.g. `window.location` to tell the environment). They get the project's jsdom when it
 * has one, otherwise a bare `window` and `location`. Returns what undoes it.
 */
function installBrowserGlobals(cwd: string): () => void {
    const globals = globalThis as unknown as Record<string, unknown>;
    const added: string[] = [];
    const add = (key: string, value: unknown) => {
        if (key in globals) return;
        try {
            globals[key] = value;
            added.push(key);
        } catch {
            // A read-only global of Node's own; it stays as it is.
        }
    };

    let close = () => undefined as void;
    try {
        const { JSDOM } = createRequire(path.join(cwd, 'package.json'))('jsdom') as Jsdom;
        const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
        for (const key of Object.getOwnPropertyNames(dom.window)) add(key, dom.window[key]);
        close = () => dom.window.close();
    } catch {
        add('location', new URL('http://localhost/'));
    }
    add('window', globalThis);
    add('self', globalThis);

    return () => {
        for (const key of added) delete globals[key];
        close();
    };
}

export async function loadProject(args: LoadProjectArgs): Promise<DefinitionsProject> {
    const { cwd, config } = args;

    const vite = await importProjectVite(cwd);
    const configured = args.viteConfig ?? config.definitions.viteConfig;
    const viteConfig = configured !== undefined
        ? path.resolve(cwd, configured)
        : (await Promise.all(VITE_CONFIGS.map(async name => (await exists(path.join(cwd, name))) ? path.join(cwd, name) : null)))
            .find(file => file !== null) ?? false;

    const previousCwd = process.cwd();
    process.chdir(cwd);
    const uninstallBrowserGlobals = installBrowserGlobals(cwd);
    const restore = () => {
        uninstallBrowserGlobals();
        process.chdir(previousCwd);
    };

    let server: ViteServer;
    try {
        server = await vite.createServer({
            configFile: viteConfig,
            // The views are loaded once, so nothing is watched: watching a large project can exceed
            // the system's limit of watchers (ENOSPC on Linux CI). Not `watch: null`, which a
            // project's `server.watch` would override (mergeConfig skips nulls) and which turns
            // off Vite's resolve cache, making the run half again as slow.
            server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
            optimizeDeps: { noDiscovery: true, include: [] },
            // Dependencies are bundled for SSR rather than imported by Node: view modules import
            // components whose CommonJS dependencies (e.g. prop-types) Node cannot give named
            // exports of.
            ssr: { noExternal: true, optimizeDeps: { noDiscovery: false } },
            appType: 'custom',
            logLevel: 'warn'
        });
    } catch (err) {
        restore();
        throw err;
    }

    try {
        return await buildProject({
            cwd,
            config,
            loadModule: id => server.ssrLoadModule(id),
            close: async () => {
                await server.close();
                restore();
            }
        });
    } catch (err) {
        await server.close();
        restore();
        throw err;
    }
}

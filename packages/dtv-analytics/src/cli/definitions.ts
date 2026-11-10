import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import fg from 'fast-glob';
import type { ViewMigrationChain, ViewProjection } from '@kronor/dtv';

/*
 * The host's definitions, for the server: its migration chains bundled into one module that
 * runs in Node without the host's `node_modules` (the server runs in a container), and a
 * manifest of them.
 */

export const DEFAULT_INCLUDE = ['**/dtv-migrations/*/index.ts'];

const IGNORED = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/var/**', '**/.git/**', '**/.dtv-analytics/**'];

/** A definition in the manifest. */
export type DefinitionEntry = {
    definition: string;
    revision: number;
    /** Changes when the chain does: what the server derived with the old one is derived again. */
    hash: string;
    projection: ViewProjection;
};

export type BundledDefinitions = {
    bundle: string;
    manifest: string;
    definitions: DefinitionEntry[];
};

export async function findChains(root: string, include: string[] = DEFAULT_INCLUDE, exclude: string[] = []): Promise<string[]> {
    const files = await fg(include, { cwd: root, ignore: [...IGNORED, ...exclude], absolute: true, onlyFiles: true });
    return files.sort();
}

/** Bundles the chains into `outDir/definitions.mjs` and lists them in `outDir/definitions.json`. */
export async function bundleDefinitions(root: string, chains: string[], outDir: string): Promise<BundledDefinitions> {
    await fs.mkdir(outDir, { recursive: true });
    const entry = [
        ...chains.map((file, index) => `import c${index} from ${JSON.stringify(file)};`),
        `export const chains = [${chains.map((_, index) => `c${index}`).join(', ')}];`,
    ].join('\n');
    const bundle = path.join(outDir, 'definitions.mjs');
    await esbuild.build({
        stdin: { contents: entry, resolveDir: root, loader: 'js' },
        bundle: true,
        platform: 'node',
        format: 'esm',
        // The chains import `@kronor/dtv`, whose styles have no meaning here
        loader: { '.css': 'empty' },
        outfile: bundle,
        logLevel: 'warning',
    });

    const module = await import(`${pathToFileURL(bundle).href}?t=${Date.now()}`) as { chains: ViewMigrationChain[] };
    const definitions = module.chains.map(chain => ({
        definition: chain.latest.definition,
        revision: chain.latest.revision,
        hash: chainHash(chain),
        projection: chain.latest,
    }));
    const manifest = path.join(outDir, 'definitions.json');
    await fs.writeFile(manifest, `${JSON.stringify(definitions, null, 2)}\n`);
    return { bundle, manifest, definitions };
}

/** A hash of the chain, its migrations' code included. */
export function chainHash(chain: ViewMigrationChain): string {
    const text = JSON.stringify(chain, (_, value: unknown) => typeof value === 'function' ? value.toString() : value);
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

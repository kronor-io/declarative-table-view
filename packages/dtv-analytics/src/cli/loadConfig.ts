import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import type { DtvAnalyticsConfig } from '../config.js';

export const CONFIG_FILE = 'dtv-analytics.config.ts';

/**
 * The host's `dtv-analytics.config.ts` (or `file`), or `undefined` when it has none. It is
 * compiled next to itself, so that what it imports resolves as it does for the file.
 */
export async function loadConfig(root: string, file: string = path.join(root, CONFIG_FILE)): Promise<DtvAnalyticsConfig | undefined> {
    if (!await fs.access(file).then(() => true, () => false)) {
        return undefined;
    }
    const compiled = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.mjs`);
    await esbuild.build({
        entryPoints: [file],
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'esm',
        outfile: compiled,
        logLevel: 'warning',
    });
    try {
        const module = await import(pathToFileURL(compiled).href) as { default?: DtvAnalyticsConfig };
        if (module.default === undefined) {
            throw new Error(`${file} has no default export`);
        }
        return module.default;
    } finally {
        await fs.unlink(compiled).catch(() => undefined);
    }
}

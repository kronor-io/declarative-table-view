import type { Command } from 'commander';
import { runTypegen } from '../typegen/runTypegen.js';

export function registerTypegenCommand(program: Command) {
    program
        .command('typegen')
        .description('Generate TypeScript types from a Hasura GraphQL schema')
        .argument('[viewId]', 'Optional view id to generate types for (only that view will be regenerated)')
        .option('-c, --config <path>', 'Path to dtv.config.ts', 'dtv.config.ts')
        .option('--debug-scan', 'Print view scanning debug information', false)
        .option('--debug-scan-file <path>', 'Only scan a specific file and print debug output for it')
        .action(async (viewId: string | undefined, opts: { config: string; debugScan?: boolean; debugScanFile?: string }) => {
            try {
                await runTypegen({
                    configPath: opts.config,
                    onlyViewId: viewId,
                    debugScan: Boolean(opts.debugScan || opts.debugScanFile),
                    debugScanFile: opts.debugScanFile
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(msg);
                process.exitCode = 1;
            }
        });
}

import type { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

async function writeFileEnsuringDir(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function renderDefaultConfigTs(options: {
    endpoint: string;
    fileNamePattern: string;
    include: string[];
    exclude: string[];
    dtvImport: string;
}): string {
    const stringifyArray = (items: string[]) => {
        const outerIndent = '        ';
        const innerIndent = '            ';
        return `[
${items.map(v => `${innerIndent}${JSON.stringify(v)}`).join(',\n')}
${outerIndent}]`;
    };

    return [
        "import type { DtvTypegenConfig } from '@kronor/dtv/typegen';",
        '',
        'const config: DtvTypegenConfig = {',
        '    schema: {',
        `        endpoint: ${JSON.stringify(options.endpoint)},`,
        '        headers: {',
        '            // Example header-based auth:',
        '            // Authorization: `Bearer ${process.env.HASURA_TOKEN}`,',
        '',
        '            // Hasura admin secret:',
        "            // 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET ?? '',",
        '        }',
        '    },',
        '',
        '    scan: {',
        '        // Scan TS/TSX files for `DSL.view({ ... })` calls (supports aliased/namespaced imports too)',
        `        include: ${stringifyArray(options.include)},`,
        `        exclude: ${stringifyArray(options.exclude)},`,
        '',
        '        // Override if you re-export DTV under a different specifier.',
        `        dtvImport: ${JSON.stringify(options.dtvImport)}`,
        '    },',
        '',
        '    output: {',
        '        // File name written next to each view module that calls DSL.view(...)',
        `        fileNamePattern: ${JSON.stringify(options.fileNamePattern)}`,
        '    },',
        '',
        '    scalars: {',
        "        // DateTime: 'string'",
        '    },',
        '',
        '    debug: {',
        '        // When true, include original GraphQL type refs as comments',
        '        includeGraphqlTypeComments: false',
        '    }',
        '};',
        '',
        'export default config;',
        ''
    ].join('\n');
}

async function runInitConfig(outPath: string, force: boolean, overrides?: Partial<{
    endpoint: string;
    fileNamePattern: string;
    dtvImport: string;
}>) {
    const absOut = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath);
    if (!force && await fileExists(absOut)) {
        throw new Error(`Refusing to overwrite existing file: ${absOut} (use --force to overwrite)`);
    }

    const content = renderDefaultConfigTs({
        endpoint: overrides?.endpoint ?? 'https://my-hasura.example.com/v1/graphql',
        fileNamePattern: overrides?.fileNamePattern ?? 'dtv.generated.{viewId}.ts',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['**/*.test.*', '**/node_modules/**'],
        dtvImport: overrides?.dtvImport ?? '@kronor/dtv'
    });

    await writeFileEnsuringDir(absOut, content);
    console.log(`Wrote ${absOut}`);
}

export function registerInitCommand(program: Command) {
    program
        .command('init')
        .description('Generate a dtv.config.ts template in the current project')
        .option('-o, --out <path>', 'Output config file path', 'dtv.config.ts')
        .option('--force', 'Overwrite if the file already exists', false)
        .option('--endpoint <url>', 'Hasura GraphQL endpoint to prefill', 'https://my-hasura.example.com/v1/graphql')
        .option('--file-pattern <pattern>', 'Output file name pattern written next to each view module', 'dtv.generated.{viewId}.ts')
        .option('--dtv-import <specifier>', 'Module specifier used by views to import DSL', '@kronor/dtv')
        .action(async (opts: { out: string; force: boolean; endpoint: string; filePattern: string; dtvImport: string }) => {
            try {
                await runInitConfig(opts.out, opts.force, {
                    endpoint: opts.endpoint,
                    fileNamePattern: opts.filePattern,
                    dtvImport: opts.dtvImport
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(msg);
                process.exitCode = 1;
            }
        });
}

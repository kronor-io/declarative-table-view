import * as readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import type { ViewMigrationChain } from '@kronor/dtv';
import { filterUses, userViewData, type AppliedFilters, type Definitions, type StoredUserData } from './derive.js';

/*
 * The server's sidecar: answers requests for what takes DTV's code, one JSON line per request
 * on standard input, one JSON line per answer on standard output, in order.
 *
 * It runs the host's definitions bundle, which the CLI builds from its `dtv-migrations`.
 */

type Request =
    | { op: 'filterUses'; events: AppliedFilters[] }
    | { op: 'userViewData'; viewDefinitions: Record<string, string>; users: StoredUserData[] };

async function loadDefinitions(bundle: string): Promise<Definitions> {
    const module = await import(pathToFileURL(bundle).href) as { chains: ViewMigrationChain[] };
    return new Map(module.chains.map(chain => [chain.latest.definition, chain]));
}

function answer(definitions: Definitions, request: Request): unknown {
    switch (request.op) {
        case 'filterUses':
            return { rows: filterUses(definitions, request.events) };
        case 'userViewData':
            return userViewData(definitions, request.viewDefinitions, request.users);
    }
}

async function main(): Promise<void> {
    const bundle = process.argv[2];
    const definitions = bundle === undefined ? new Map() : await loadDefinitions(bundle);
    process.stderr.write(`Sidecar ready with ${definitions.size} definitions\n`);

    const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
        let output: unknown;
        try {
            output = answer(definitions, JSON.parse(line) as Request);
        } catch (error) {
            output = { error: error instanceof Error ? error.message : String(error) };
        }
        process.stdout.write(`${JSON.stringify(output)}\n`);
    }
}

await main();

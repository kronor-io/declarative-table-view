/**
 * @jest-environment node
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSchema, getIntrospectionQuery, graphqlSync } from 'graphql';

jest.mock('fast-glob', () => ({
    __esModule: true,
    default: jest.fn(async (patterns: string | string[]) => Array.isArray(patterns) ? patterns : [patterns])
}), { virtual: true });

import { runTypegen } from './runTypegen';

// A view that produces no types leaves whatever is committed in place, so the
// row type it describes goes stale while the run still reports success. Each
// way that can happen is reported here.

const schema = buildSchema(`
    type Query { paymentRequests: [PaymentRequest!]! }
    type PaymentRequest { id: ID!  amount: Int! }
`);
const introspection = graphqlSync({ schema, source: getIntrospectionQuery({ descriptions: true }) });

async function project(viewSource: string) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-typegen-report-'));
    const configPath = path.join(root, 'dtv.config.cjs');
    const viewPath = path.join(root, 'view.ts');

    await fs.writeFile(configPath, `
module.exports = {
    schema: { endpoint: 'https://example.test/graphql' },
    scan: { include: [${JSON.stringify(viewPath)}], dtvImport: '@kronor/dtv' },
    output: { fileNamePattern: '{viewId}.typegen.ts' }
};
`, 'utf8');
    await fs.writeFile(viewPath, viewSource, 'utf8');

    return { root, configPath, viewPath, generated: path.join(root, 'payments.typegen.ts') };
}

const inlineView = (id: string) => `
import { DSL } from '@kronor/dtv';

export const view = DSL.view({
    id: ${id},
    source: { type: 'collection', collectionName: 'paymentRequests' },
    columnDefinitions: [
        DSL.column({
            id: 'id',
            data: [{ field: 'id' }]
        })
    ]
});
`;

describe('cli/typegen reporting', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const withFetch = async (run: () => Promise<void>) => {
        const originalFetch = globalThis.fetch;
        (globalThis as any).fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ data: introspection.data })
        })) as any;
        try {
            await run();
        } finally {
            (globalThis as any).fetch = originalFetch;
        }
    };

    it('warns about a view whose id is not a string literal', async () => {
        const { root, configPath, generated } = await project(inlineView('`payments-${tenant}`'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);

        try {
            await withFetch(async () => {
                // Nothing to generate, so the run has no views at all.
                await expect(runTypegen({ configPath })).rejects.toThrow('No views found');
            });

            const warnings = warn.mock.calls.map(call => String(call[0]));
            expect(warnings.some(line => line.includes('was not read') && line.includes('id=not a string literal'))).toBe(true);
            await expect(fs.access(generated)).rejects.toThrow();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('warns when a view passes a rowType of its own instead of the generated one', async () => {
        const { root, configPath, generated } = await project(`
import { DSL } from '@kronor/dtv';

export const view = DSL.view({
    id: 'payments',
    source: { type: 'collection', collectionName: 'paymentRequests' },
    columnDefinitions: [
        DSL.column({
            rowType: {} as any,
            id: 'id',
            data: [{ field: 'id' }]
        })
    ]
});
`);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        try {
            await withFetch(async () => {
                await runTypegen({ configPath });
            });

            // The view looks covered, so its silence would read as success.
            const warnings = warn.mock.calls.map(call => String(call[0]));
            expect(warnings.some(line =>
                line.includes('generated no types for view "payments"')
                && line.includes('rowType: {} as any')
                && line.includes('PaymentsRowType')
                && line.includes('hand-written type'))).toBe(true);
            expect(log.mock.calls.map(call => String(call[0]))).toContain('Generated types for 0 of 1 view(s).');
            await expect(fs.access(generated)).rejects.toThrow();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('accounts for a view that passes no rowType at all', async () => {
        // Every column comes from a shared helper, so there is no inline
        // column for type generation to add a rowType to.
        const { root, configPath } = await project(`
import { DSL } from '@kronor/dtv';
import { sharedColumn } from './shared';

export const view = DSL.view({
    id: 'payments',
    source: { type: 'collection', collectionName: 'paymentRequests' },
    columnDefinitions: [sharedColumn()]
});
`);
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            await withFetch(async () => {
                await runTypegen({ configPath });
            });

            // Opting out is fair, but the count has to add up either way.
            const lines = log.mock.calls.map(call => String(call[0]));
            expect(lines).toContain('View "payments" passes no rowType, so it has no generated types.');
            expect(warn).not.toHaveBeenCalled();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('counts the views it actually wrote, not the ones it found', async () => {
        const { root, configPath } = await project(inlineView(`'payments'`));
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            await withFetch(() => runTypegen({ configPath }));
            expect(log.mock.calls.map(call => String(call[0]))).toContain('Generated types for 1 of 1 view(s).');
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('fails, naming the view, when writing its types throws', async () => {
        const { root, configPath, generated } = await project(inlineView(`'payments'`));
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            await withFetch(async () => {
                await runTypegen({ configPath });

                // Stand in for anything that can throw mid-generation. The run
                // used to swallow it, report success, and leave the committed
                // types frozen at whatever they already were.
                await fs.rm(generated);
                await fs.mkdir(generated);

                log.mockClear();
                await expect(runTypegen({ configPath })).rejects.toThrow(/payments: .*EISDIR|payments: /);
                expect(log.mock.calls.map(call => String(call[0]))).toContain('Generated types for 0 of 1 view(s).');
            });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('reports removing the generated module when a view stops passing its row type', async () => {
        const { root, configPath, viewPath, generated } = await project(inlineView(`'payments'`));
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            await withFetch(async () => {
                await runTypegen({ configPath });
                await fs.access(generated);

                // The columns move out to a helper, so nothing in the view
                // passes the row type and nothing is left to patch either.
                await fs.writeFile(viewPath, `
import { DSL } from '@kronor/dtv';
import { paymentColumns } from './columns';

export const view = DSL.view({
    id: 'payments',
    source: { type: 'collection', collectionName: 'paymentRequests' },
    columnDefinitions: paymentColumns
});
`, 'utf8');

                warn.mockClear();
                await runTypegen({ configPath });

                const warnings = warn.mock.calls.map(call => String(call[0]));
                expect(warnings.some(line => line.includes('Removed') && line.includes('payments'))).toBe(true);
                await expect(fs.access(generated)).rejects.toThrow();
            });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});

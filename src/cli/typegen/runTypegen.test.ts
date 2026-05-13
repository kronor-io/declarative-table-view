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

describe('cli/typegen/runTypegen', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('generates the type module and patches inline columns for a new view', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-typegen-'));
        const configPath = path.join(tempRoot, 'dtv.config.cjs');
        const viewPath = path.join(tempRoot, 'new-view.ts');
        const generatedPath = path.join(tempRoot, 'new-view.typegen.ts');

        const schema = buildSchema(`
            type Query {
                paymentRequests: [PaymentRequest!]!
            }

            type PaymentRequest {
                id: ID!
                amount: Int!
            }
        `);
        const introspection = graphqlSync({
            schema,
            source: getIntrospectionQuery({ descriptions: true })
        });
        if (introspection.errors?.length) {
            throw new Error(introspection.errors.map(error => error.message).join('\n'));
        }

        const originalFetch = globalThis.fetch;
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => ({ data: introspection.data })
        })) as any;
        (globalThis as any).fetch = fetchMock;

        try {
            await fs.writeFile(configPath, `
module.exports = {
    schema: {
        endpoint: 'https://example.test/graphql'
    },
    scan: {
        include: [${JSON.stringify(viewPath)}],
        dtvImport: '@kronor/dtv'
    },
    output: {
        fileNamePattern: '{viewId}.typegen.ts'
    }
};
`, 'utf8');

            await fs.writeFile(viewPath, `
import { DSL } from '@kronor/dtv';

export const view = DSL.view({
    id: 'new-view',
    source: {
        type: 'collection',
        collectionName: 'paymentRequests'
    },
    columnDefinitions: [
        DSL.column({
            id: 'id',
            data: [{ field: 'id' }]
        })
    ]
});
`, 'utf8');

            await runTypegen({
                configPath
            });

            const generated = await fs.readFile(generatedPath, 'utf8');
            const updatedView = await fs.readFile(viewPath, 'utf8');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(generated).toContain("export type NewViewRow = PaymentRequest;");
            expect(generated).toContain("export const NewViewRowType = DTV.rowType<NewViewRow>();");
            expect(updatedView).toContain("import { NewViewRowType } from './new-view.typegen';");
            expect(updatedView).toContain('rowType: NewViewRowType,');
        } finally {
            (globalThis as any).fetch = originalFetch;
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it('resolves row types for function-backed views', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-typegen-function-'));
        const configPath = path.join(tempRoot, 'dtv.config.cjs');
        const viewPath = path.join(tempRoot, 'function-view.ts');
        const generatedPath = path.join(tempRoot, 'function-view.typegen.ts');

        const schema = buildSchema(`
            input SearchPaymentsArgs {
                merchantId: ID!
            }

            type Query {
                searchPayments(args: SearchPaymentsArgs, where: PaymentRequest_bool_exp, limit: Int, orderBy: [PaymentRequest_order_by!]): [PaymentRequest!]!
            }

            input PaymentRequest_bool_exp {
                id: ID_comparison_exp
            }

            input ID_comparison_exp {
                _eq: ID
            }

            input PaymentRequest_order_by {
                id: order_by
            }

            enum order_by {
                asc
                desc
            }

            type PaymentRequest {
                id: ID!
                amount: Int!
            }
        `);
        const introspection = graphqlSync({
            schema,
            source: getIntrospectionQuery({ descriptions: true })
        });
        if (introspection.errors?.length) {
            throw new Error(introspection.errors.map(error => error.message).join('\n'));
        }

        const originalFetch = globalThis.fetch;
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => ({ data: introspection.data })
        })) as any;
        (globalThis as any).fetch = fetchMock;

        try {
            await fs.writeFile(configPath, `
module.exports = {
    schema: {
        endpoint: 'https://example.test/graphql'
    },
    scan: {
        include: [${JSON.stringify(viewPath)}],
        dtvImport: '@kronor/dtv'
    },
    output: {
        fileNamePattern: '{viewId}.typegen.ts'
    }
};
`, 'utf8');

            await fs.writeFile(viewPath, `
import { DSL } from '@kronor/dtv';

export const view = DSL.view({
    id: 'function-view',
    source: {
        type: 'function',
        functionName: 'searchPayments',
        args: { merchantId: 'merchant-123' }
    },
    columnDefinitions: [
        DSL.column({
            id: 'id',
            data: [{ field: 'id' }]
        })
    ]
});
`, 'utf8');

            await runTypegen({
                configPath
            });

            const generated = await fs.readFile(generatedPath, 'utf8');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(generated).toContain('export type FunctionViewRow = PaymentRequest;');
        } finally {
            (globalThis as any).fetch = originalFetch;
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });
});

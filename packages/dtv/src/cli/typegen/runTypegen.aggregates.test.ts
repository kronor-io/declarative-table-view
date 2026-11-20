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

const unsorted = async () => ({ columnsOf: () => ({}), close: async () => undefined });

const ordersSchema = (withAggregate: boolean) => buildSchema(`
    type Query {
        orders: [Order!]!
        ${withAggregate ? 'orders_aggregate: OrderAggregate!' : ''}
        ${withAggregate ? 'ordersTotals: OrderAggregate!' : ''}
    }

    type Order {
        id: ID!
        amount: Int!
    }

    ${withAggregate ? `
    type OrderAggregate {
        aggregate: OrderAggregateFields
        nodes: [Order!]!
    }

    type OrderAggregateFields {
        count: Int!
        sum: OrderSumFields
    }

    type OrderSumFields {
        amount: Int
    }` : ''}
`);

/** Runs typegen for one view module over `schema`; the generated module, or the error. */
async function generate(viewSource: string, schema: ReturnType<typeof buildSchema>) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-typegen-aggregates-'));
    const configPath = path.join(tempRoot, 'dtv.config.cjs');
    const viewPath = path.join(tempRoot, 'orders.ts');
    const introspection = graphqlSync({ schema, source: getIntrospectionQuery({ descriptions: true }) });
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: introspection.data }) }));

    try {
        await fs.writeFile(configPath, `
module.exports = {
    schema: { endpoint: 'https://example.test/graphql' },
    scan: { include: [${JSON.stringify(viewPath)}], dtvImport: '@kronor/dtv' },
    output: { fileNamePattern: '{viewId}.typegen.ts', typesDir: ${JSON.stringify(path.join(tempRoot, 'types'))} }
};
`, 'utf8');
        await fs.writeFile(viewPath, viewSource, 'utf8');
        await runTypegen({ configPath, loadColumnOrdering: unsorted });
        return {
            generated: await fs.readFile(path.join(tempRoot, 'orders.typegen.ts'), 'utf8'),
            typeModules: (await fs.readdir(path.join(tempRoot, 'types'))).sort()
        };
    } catch (error) {
        return { error: error as Error };
    } finally {
        (globalThis as any).fetch = originalFetch;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
}

const viewWith = (source: string, aggregates: string) => `
import { DSL } from '@kronor/dtv';

const totals = DSL.aggregate({ aggregateType: OrdersAggregateType, select: a => [a.count()] });

export const view = DSL.view({
    id: 'orders',
    source: ${source},
    columnDefinitions: [
        DSL.column({ id: 'id', data: [{ field: 'id' }] })
    ],
    ${aggregates}
});
`;

describe('cli/typegen/runTypegen aggregates', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('emits the aggregate type of a view with aggregates', async () => {
        const { generated, typeModules } = await generate(viewWith("{ type: 'collection', collectionName: 'orders' }", 'aggregates: { totals },'), ordersSchema(true));

        expect(generated).toContain('export type OrdersAggregate = OrderAggregateFields;');
        expect(generated).toContain('export const OrdersAggregateType = DTV.rowType<OrdersAggregate>();');
        expect(generated).toContain('export type OrdersRow = Order;');
        expect(typeModules).toEqual(['Order.ts', 'OrderAggregateFields.ts', 'OrderSumFields.ts']);
    });

    it('reads a renamed aggregate root field from source.aggregateName', async () => {
        const { generated } = await generate(
            viewWith("{ type: 'collection', collectionName: 'orders', aggregateName: 'ordersTotals' }", 'aggregates: { totals },'),
            ordersSchema(true)
        );

        expect(generated).toContain('export type OrdersAggregate = OrderAggregateFields;');
    });

    it('emits no aggregate type for a view without aggregates', async () => {
        const { generated, typeModules } = await generate(viewWith("{ type: 'collection', collectionName: 'orders' }", ''), ordersSchema(true));

        expect(generated).not.toContain('OrdersAggregate');
        expect(generated).not.toContain('OrderAggregateFields');
        expect(typeModules).toEqual(['Order.ts']);
    });

    it('fails a view with aggregates when the schema cannot aggregate its rows', async () => {
        const { error } = await generate(viewWith("{ type: 'collection', collectionName: 'orders' }", 'aggregates: { totals },'), ordersSchema(false));

        expect(error?.message).toContain('View "orders" has aggregates, but Query has no "orders_aggregate"');
    });
});

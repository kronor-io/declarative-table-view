import { describe, it, expect } from '@jest/globals';
import { buildSchema } from 'graphql';
import { collectReachableTypes, renderTsFromSchema } from './schemaToTs';

describe('cli/typegen/schemaToTs', () => {
    it('renders object types with correct nullability and scalar mapping', () => {
        const schema = buildSchema(`
            type Query {
                paymentRequests: [PaymentRequest!]!
            }

            scalar CustomScalar

            type PaymentRequest {
                id: ID!
                amount: Int!
                customer: Customer
                custom: CustomScalar!
            }

            type Customer {
                email: String!
            }
        `);

        const root = schema.getType('PaymentRequest');
        if (!root || Array.isArray(root)) throw new Error('Missing PaymentRequest type');

        const types = collectReachableTypes(schema, [root as any]);
        const tsOut = renderTsFromSchema(types, {
            includeGraphqlTypeComments: true
        });

        const tsOutLocal = renderTsFromSchema(types, {
            exportTypes: false
        });

        expect(tsOut).toContain('export type PaymentRequest');
        expect(tsOutLocal).toContain('type PaymentRequest');
        expect(tsOutLocal).not.toContain('export type PaymentRequest');
        expect(tsOut).toContain('id: string;');
        expect(tsOut).toContain('amount: number;');
        // Nullable field becomes union with null
        expect(tsOut).toContain('customer: Customer | null;');
        // Non-null nested scalar
        expect(tsOut).toContain('email: string;');
        // Unmapped scalar falls back to unknown
        expect(tsOut).toContain('custom: unknown;');
        // Debug comments include original GraphQL type
        expect(tsOut).toContain('// GraphQL: CustomScalar!');
    });
});

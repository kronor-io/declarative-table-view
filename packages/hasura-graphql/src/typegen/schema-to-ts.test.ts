import { describe, it, expect } from '@jest/globals';
import { buildSchema } from 'graphql';
import { collectReachableTypes, renderTsFromSchema } from './schema-to-ts.js';

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
    it('renders readonly fields and lists when immutableTypes is set', () => {
        const schema = buildSchema(`
            type Query {
                invoices: [Invoice!]!
            }

            type Invoice {
                id: ID!
                lines: [InvoiceLine!]!
                tags: [String]
            }

            type InvoiceLine {
                amount: Int
            }
        `);

        const root = schema.getType('Invoice');
        if (!root || Array.isArray(root)) throw new Error('Missing Invoice type');

        const types = collectReachableTypes(schema, [root as any]);
        const immutable = renderTsFromSchema(types, { immutableTypes: true, includeGraphqlTypeComments: true });
        const mutable = renderTsFromSchema(types);

        expect(immutable).toContain('readonly id: string; // GraphQL: ID!');
        expect(immutable).toContain('readonly lines: ReadonlyArray<InvoiceLine>;');
        expect(immutable).toContain('readonly tags: ReadonlyArray<string | null> | null;');
        expect(immutable).toContain('readonly amount: number | null;');
        expect(immutable).not.toMatch(/[^y]Array</);

        expect(mutable).toContain('lines: Array<InvoiceLine>;');
        expect(mutable).not.toContain('readonly');
    });
});

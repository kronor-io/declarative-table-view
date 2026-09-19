import { describe, it, expect } from '@jest/globals';
import { arrayQuery, valueQuery, objectQuery } from './ast.js';
import { buildSelectionSet } from './selection-set.js';
import {
    renderGraphQLQuery,
    renderGraphQLLiteral,
    graphqlEnumValue,
    isGraphQLEnumValue,
    graphqlVariableReference,
    orderByArgumentValue,
    toGraphQLArgumentValue,
    rootFieldsOf,
    ensureSelectionPath,
} from './document.js';
import type { GraphQLQueryAST, GraphQLMultiRootQueryAST } from './document.js';
import { Hasura } from '../hasura/filter-expression.js';

describe('enum argument values', () => {
    it('renders an enum bare and a string quoted', () => {
        expect(renderGraphQLLiteral(graphqlEnumValue('ASC'))).toBe('ASC');
        expect(renderGraphQLLiteral('ASC')).toBe('"ASC"');
    });

    it('recognizes its own enum values and nothing else', () => {
        expect(isGraphQLEnumValue(graphqlEnumValue('ASC'))).toBe(true);
        expect(isGraphQLEnumValue({ type: 'variable', name: 'id' })).toBe(false);
        expect(isGraphQLEnumValue('ASC')).toBe(false);
    });

    it('passes enum values through toGraphQLArgumentValue untouched', () => {
        const value = graphqlEnumValue('ASC');
        expect(toGraphQLArgumentValue(value)).toBe(value);
    });

    it('renders a root-field orderBy as an enum, not a quoted string', () => {
        const query = renderGraphQLQuery({
            operation: 'query',
            variables: [],
            rootField: {
                field: 'Currency',
                alias: 'currencyOptions',
                args: [{ name: 'orderBy', value: orderByArgumentValue({ currencyCode: 'ASC' }) }],
            },
            selectionSet: [{ field: 'id' }],
        });

        expect(query).toContain('currencyOptions: Currency(orderBy: {currencyCode: ASC})');
    });
});

describe('orderByArgumentValue', () => {
    it('upper-cases directions so lowercase input is accepted', () => {
        expect(renderGraphQLLiteral(orderByArgumentValue({ name: 'asc' } as never))).toBe('{name: ASC}');
    });

    it('keeps nesting and handles a list of order-by objects', () => {
        const value = orderByArgumentValue([{ customer: { name: 'ASC' } }, { id: 'DESC' }]);
        expect(renderGraphQLLiteral(value)).toBe('[{customer: {name: ASC}}, {id: DESC}]');
    });
});

describe('variables and enums inside a where clause', () => {
    it('renders a variable reference used as an operator value', () => {
        const query = renderGraphQLQuery({
            operation: 'query',
            variables: [{ name: 'vendorId', type: 'bigint!' }],
            rootField: { field: 'Order' },
            selectionSet: buildSelectionSet([{
                fieldQuery: arrayQuery({
                    field: 'lines',
                    selectionSet: [valueQuery({ field: 'sku' })],
                    where: Hasura.condition('vendorId', Hasura.eq(graphqlVariableReference('vendorId'))),
                }),
            }]),
        });

        expect(query).toContain('lines(where: {vendorId: {_eq: $vendorId}})');
    });
});

describe('offset', () => {
    it('renders an offset argument next to limit', () => {
        const query = renderGraphQLQuery({
            operation: 'query',
            variables: [],
            rootField: { field: 'Order' },
            selectionSet: [{ field: 'lines', limit: 5, offset: 10, selections: [{ field: 'sku' }] }],
        });

        expect(query).toContain('lines(limit: 5, offset: 10)');
    });
});

describe('multi-root documents', () => {
    it('renders every root field in one document', () => {
        const ast: GraphQLMultiRootQueryAST = {
            operation: 'query',
            variables: [{ name: 'id', type: 'bigint!' }],
            rootFields: [
                {
                    field: 'BmpEventReservation',
                    args: [{
                        name: 'where',
                        value: toGraphQLArgumentValue({ id: { _eq: graphqlVariableReference('id') } }),
                    }],
                    selectionSet: [{ field: 'id' }, { field: 'transactionNo' }],
                },
                {
                    field: 'Currency',
                    alias: 'currencyOptions',
                    args: [{ name: 'orderBy', value: orderByArgumentValue({ currencyCode: 'ASC' }) }],
                    selectionSet: [{ field: 'id' }, { field: 'currencyCode' }],
                },
            ],
        };

        const query = renderGraphQLQuery(ast);

        expect(query).toContain('query($id: bigint!)');
        expect(query).toContain('BmpEventReservation(where: {id: {_eq: $id}})');
        expect(query).toContain('currencyOptions: Currency(orderBy: {currencyCode: ASC})');
        expect(query).toContain('transactionNo');
        expect(query).toContain('currencyCode');
    });

    it('renders a single-root document exactly as the single-root form does', () => {
        const selectionSet = buildSelectionSet([
            { fieldQuery: valueQuery({ field: 'id' }) },
            { fieldQuery: objectQuery({ field: 'customer', selectionSet: [valueQuery({ field: 'email' })] }) },
        ]);
        const rootField = { field: 'orders', args: [{ name: 'limit', value: 10 }] };

        const single: GraphQLQueryAST = { operation: 'query', variables: [], rootField, selectionSet };
        const multi: GraphQLMultiRootQueryAST = {
            operation: 'query',
            variables: [],
            rootFields: [{ ...rootField, selectionSet }],
        };

        expect(renderGraphQLQuery(multi)).toBe(renderGraphQLQuery(single));
    });
});

describe('rootFieldsOf', () => {
    it('normalizes the single-root form', () => {
        expect(rootFieldsOf({
            operation: 'query',
            variables: [],
            rootField: { field: 'orders', alias: 'all' },
            selectionSet: [{ field: 'id' }],
        })).toEqual([{ field: 'orders', alias: 'all', selectionSet: [{ field: 'id' }] }]);
    });

    it('returns the root fields of the multi-root form as they are', () => {
        const rootFields = [{ field: 'orders', selectionSet: [{ field: 'id' }] }];
        expect(rootFieldsOf({ operation: 'query', variables: [], rootFields })).toBe(rootFields);
    });
});

describe('ensureSelectionPath merging', () => {
    it('merges a path that partially overlaps an existing selection', () => {
        const set = ensureSelectionPath([{ field: 'customer', selections: [{ field: 'name' }] }], 'customer.id');

        expect(set).toEqual([
            { field: 'customer', selections: [{ field: 'name' }, { field: 'id' }] },
        ]);
    });

    it('builds one selection per field when several paths share a prefix', () => {
        const set = ['id', 'vendor.name', 'vendor.id', 'invoice.reference']
            .reduce(ensureSelectionPath, []);

        expect(set).toEqual([
            { field: 'id' },
            { field: 'vendor', selections: [{ field: 'name' }, { field: 'id' }] },
            { field: 'invoice', selections: [{ field: 'reference' }] },
        ]);
    });
});

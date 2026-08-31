import { describe, it, expect } from '@jest/globals';
import {
    Hasura,
    hasuraFilterExpressionToObject,
    hasuraFilterExpressionsAreEqual,
    normalizeHasuraFilterExpression,
} from './filter-expression.js';

describe('hasuraFilterExpressionToObject', () => {
    it('nests a dotted condition path', () => {
        expect(hasuraFilterExpressionToObject(Hasura.condition('customer.email', Hasura.eq('a@b.c'))))
            .toEqual({ customer: { email: { _eq: 'a@b.c' } } });
    });

    it('drops empty branches and unwraps single-item logical nodes', () => {
        const expr = Hasura.and(Hasura.empty(), Hasura.condition('id', Hasura.eq(1)), Hasura.empty());
        expect(hasuraFilterExpressionToObject(expr)).toEqual({ id: { _eq: 1 } });
    });

    it('keeps multiple branches under _and / _or', () => {
        const expr = Hasura.or(Hasura.condition('a', Hasura.eq(1)), Hasura.condition('b', Hasura.eq(2)));
        expect(hasuraFilterExpressionToObject(expr)).toEqual({
            _or: [{ a: { _eq: 1 } }, { b: { _eq: 2 } }]
        });
    });

    it('compiles a scope whose inner expression is empty to an empty object', () => {
        expect(hasuraFilterExpressionToObject(Hasura.scope('lines', Hasura.empty()))).toEqual({});
    });

    it('nests a scope around its inner expression', () => {
        const expr = Hasura.scope('lines', Hasura.condition('sku', Hasura.eq('X')));
        expect(hasuraFilterExpressionToObject(expr)).toEqual({ lines: { sku: { _eq: 'X' } } });
    });

    it('compiles _not', () => {
        expect(hasuraFilterExpressionToObject(Hasura.not(Hasura.condition('id', Hasura.eq(1)))))
            .toEqual({ _not: { id: { _eq: 1 } } });
    });
});

describe('normalizeHasuraFilterExpression', () => {
    it('flattens nested _and nodes', () => {
        const expr = Hasura.and(
            Hasura.condition('a', Hasura.eq(1)),
            Hasura.and(Hasura.condition('b', Hasura.eq(2)), Hasura.condition('c', Hasura.eq(3)))
        );
        const normalized = normalizeHasuraFilterExpression(expr);
        expect(normalized.kind).toBe('and');
        expect(normalized.kind === 'and' && normalized.items).toHaveLength(3);
    });

    it('collapses a scope over a condition into a single path', () => {
        const expr = Hasura.scope('customer', Hasura.condition('email', Hasura.eq('a@b.c')));
        expect(normalizeHasuraFilterExpression(expr)).toEqual({
            kind: 'where',
            path: ['customer', 'email'],
            operator: { _eq: 'a@b.c' }
        });
    });
});

describe('hasuraFilterExpressionsAreEqual', () => {
    it('ignores the order of _and members', () => {
        const a = Hasura.and(Hasura.condition('a', Hasura.eq(1)), Hasura.condition('b', Hasura.eq(2)));
        const b = Hasura.and(Hasura.condition('b', Hasura.eq(2)), Hasura.condition('a', Hasura.eq(1)));
        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(true);
    });

    it('treats a scoped condition and its flattened path as equal', () => {
        const scoped = Hasura.scope('customer', Hasura.condition('email', Hasura.eq('x')));
        const flat = Hasura.condition('customer.email', Hasura.eq('x'));
        expect(hasuraFilterExpressionsAreEqual(scoped, flat)).toBe(true);
    });

    it('distinguishes different operators', () => {
        const a = Hasura.condition('id', Hasura.eq(1));
        const b = Hasura.condition('id', Hasura.neq(1));
        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(false);
    });
});

import { hasuraConditionsAreEqual, hasuraOperatorsAreEqual, HasuraCondition, HasuraOperator } from './graphql';

describe('hasuraConditionsAreEqual', () => {
    it('compares simple field operator equality', () => {
        const a: HasuraCondition = { id: { _eq: 1 } } as any;
        const b: HasuraCondition = { id: { _eq: 1 } } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(true);
    });

    it('treats _and order as insensitive', () => {
        const a: HasuraCondition = { _and: [{ id: { _eq: 1 } }, { active: { _eq: true } }] } as any;
        const b: HasuraCondition = { _and: [{ active: { _eq: true } }, { id: { _eq: 1 } }] } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(true);
    });

    it('treats _or order as insensitive', () => {
        const a: HasuraCondition = { _or: [{ status: { _eq: 'A' } }, { status: { _eq: 'B' } }] } as any;
        const b: HasuraCondition = { _or: [{ status: { _eq: 'B' } }, { status: { _eq: 'A' } }] } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(true);
    });

    it('detects inequality in nested structure', () => {
        const a: HasuraCondition = { _and: [{ id: { _eq: 1 } }, { score: { _gt: 10 } }] } as any;
        const b: HasuraCondition = { _and: [{ id: { _eq: 1 } }, { score: { _gt: 11 } }] } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(false);
    });

    it('handles _not condition', () => {
        const a: HasuraCondition = { _not: { id: { _eq: 1 } } } as any;
        const b: HasuraCondition = { _not: { id: { _eq: 1 } } } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(true);
    });

    it('handles arrays of HasuraOperator in field equality', () => {
        const a: HasuraCondition = { tags: [{ _eq: 'A' }, { _eq: 'B' }] } as any;
        const b: HasuraCondition = { tags: [{ _eq: 'B' }, { _eq: 'A' }] } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(true);
    });

    it('distinguishes different array content', () => {
        const a: HasuraCondition = { tags: [{ _eq: 'A' }, { _eq: 'B' }] } as any;
        const b: HasuraCondition = { tags: [{ _eq: 'A' }, { _eq: 'C' }] } as any;
        expect(hasuraConditionsAreEqual(a, b)).toBe(false);
    });

    it('compares individual HasuraOperator objects', () => {
        const opA: HasuraOperator = { _eq: 5 } as any;
        const opB: HasuraOperator = { _eq: 5 } as any;
        const opC: HasuraOperator = { _eq: 6 } as any;
        expect(hasuraOperatorsAreEqual(opA, opB)).toBe(true);
        expect(hasuraOperatorsAreEqual(opA, opC)).toBe(false);
    });
});

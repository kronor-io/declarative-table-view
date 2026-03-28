import { hasuraFilterExpressionToObject, hasuraFilterExpressionsAreEqual, Hasura } from './graphql';

describe('hasuraFilterExpressionsAreEqual', () => {
    it('compares simple field operator equality', () => {
        const a = Hasura.condition('id', Hasura.eq(1));
        const b = Hasura.condition('id', Hasura.eq(1));
        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(true);
    });

    it('treats AND order as insensitive', () => {
        const a = Hasura.and(
            Hasura.condition('id', Hasura.eq(1)),
            Hasura.condition('active', Hasura.eq(true))
        );
        const b = Hasura.and(
            Hasura.condition('active', Hasura.eq(true)),
            Hasura.condition('id', Hasura.eq(1))
        );
        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(true);
    });

    it('treats OR order as insensitive', () => {
        const a = Hasura.or(
            Hasura.condition('status', Hasura.eq('A')),
            Hasura.condition('status', Hasura.eq('B'))
        );
        const b = Hasura.or(
            Hasura.condition('status', Hasura.eq('B')),
            Hasura.condition('status', Hasura.eq('A'))
        );
        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(true);
    });

    it('detects inequality in nested structure', () => {
        const a = Hasura.and(
            Hasura.condition('id', Hasura.eq(1)),
            Hasura.condition('score', Hasura.gt(10))
        );
        const b = Hasura.and(
            Hasura.condition('id', Hasura.eq(1)),
            Hasura.condition('score', Hasura.gt(11))
        );
        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(false);
    });

    it('supports nested relationship scoping', () => {
        const a = Hasura.scope(
            'user.profile',
            Hasura.condition('name', Hasura.ilike('%anna%'))
        );
        const b = Hasura.condition('user.profile.name', Hasura.ilike('%anna%'));

        expect(hasuraFilterExpressionToObject(a)).toEqual({
            user: {
                profile: {
                    name: { _ilike: '%anna%' }
                }
            }
        });

        expect(hasuraFilterExpressionsAreEqual(a, b)).toBe(true);
    });

    it('supports nesting logical expressions under relationships', () => {
        const a = Hasura.scope(
            'vendorBillApprovalFlows',
            Hasura.and(
                Hasura.condition('status', Hasura.in(['approved', 'partial'])),
                Hasura.or(
                    Hasura.condition('approver.id', Hasura.in([1, 2])),
                    Hasura.condition('temporaryApprover.id', Hasura.in([1, 2]))
                )
            )
        );

        expect(hasuraFilterExpressionToObject(a)).toEqual({
            vendorBillApprovalFlows: {
                _and: [
                    { status: { _in: ['approved', 'partial'] } },
                    {
                        _or: [
                            { approver: { id: { _in: [1, 2] } } },
                            { temporaryApprover: { id: { _in: [1, 2] } } }
                        ]
                    }
                ]
            }
        });
    });
});

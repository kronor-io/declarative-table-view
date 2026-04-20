import { describe, it, expect } from '@jest/globals';
import { rowType } from './columns';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filter } from './filters';
import { hasuraDSLforRowType } from './hasura';
import { TransformResult, type ConditionOnlyTransform } from '../framework/filters';

type Row = {
    id: string;
    amount: number | null;
    customer?: {
        email: string | null;
    } | null;
};

describe('dsl/transforms row-aware typing', () => {
    it('supports condition-producing transforms with row-typed Hasura conditions', () => {
        const H = hasuraDSLforRowType(rowType<Row>());

        const conditionTransform: ConditionOnlyTransform = {
            toQuery: (_input: unknown) => {
                void _input;
                return TransformResult.condition(
                    H.and(
                        H.condition('id', H.eq('abc')),
                        H.condition('amount', H.gt(10))
                    )
                );
            }
        };

        const badTransform: ConditionOnlyTransform = {
            toQuery: (_input: unknown) => {
                void _input;
                // @ts-expect-error invalid field path should fail at compile-time
                return TransformResult.condition(H.condition('nope', H.eq('abc')));
            }
        };

        const badValueTransform: ConditionOnlyTransform = {
            toQuery: (_input: unknown) => {
                void _input;
                // @ts-expect-error wrong operator value type should fail at compile-time
                return TransformResult.condition(H.condition('amount', H.eq('abc')));
            }
        };

        // A full filter schema leaf using a transform that returns `{ condition }`
        filter({
            rowType: rowType<Row>(),
            id: 'amount-gt',
            label: 'Amount > 10',
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.number(),
                transform: {
                    toQuery: (_input: unknown) => {
                        void _input;
                        return TransformResult.condition(H.condition('amount', H.gt(10)));
                    }
                }
            })
        });

        // ConditionOnlyTransform should be accepted by computedCondition
        FilterExpr.computedCondition({
            control: FilterControl.text(),
            transform: conditionTransform
        });

        // Avoid unused vars without affecting type-check intent
        void badTransform;
        void badValueTransform;

        expect(true).toBe(true);
    });
});

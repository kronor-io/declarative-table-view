import { describe, it, expect } from '@jest/globals';
import { rowType } from './columns';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { filterExprForRowType } from './filterExprForRow';
import { filter } from './filters';
import { hasuraDSLforRowType } from './hasura';
import { TransformResult, type FilterTransform } from '../framework/filters';
import { buildHasuraConditions, hasuraFilterExpressionToObject } from '../framework/graphql';
import * as FilterValue from '../framework/filterValue';
import type { FilterGroups } from '../framework/filters';
import type { FilterState } from '../framework/state';

// A transform is told which filter it belongs to: `context.field` is the very
// path the leaf declares, and `context.result` builds results against the row.

type ExampleRow = {
    id: string;
    amount: number | null;
    customer?: { email: string | null } | null;
};

const Row = rowType<ExampleRow>();
const F = filterExprForRowType(Row);
const H = hasuraDSLforRowType(Row);

describe('dsl transform context', () => {
    it('hands the transform the leaf’s own field', () => {
        F.greaterThan(
            { field: 'amount', control: FilterControl.number() },
            // The literal path, so the row-scoped Hasura DSL accepts it and
            // resolves the field's type from it.
            { toQuery: (input, context) => TransformResult.condition(H.condition(context.field, H.gt(Number(input)))) }
        );

        F.greaterThan(
            { field: 'amount', control: FilterControl.number() },
            // @ts-expect-error ilike is not available for the numeric field this leaf filters
            { toQuery: (_input, context) => TransformResult.condition(H.condition(context.field, H.ilike('%x%'))) }
        );

        // The plain builder knows the field too, but has no row to check against.
        FilterExpr.greaterThan({
            field: 'amount',
            control: FilterControl.number(),
            transform: { toQuery: (input, context) => context.result.fieldValue(context.field, input) }
        });
    });

    it('checks a redirected field against the row', () => {
        F.equals(
            { field: 'id', control: FilterControl.text() },
            { toQuery: (input, context) => context.result.fieldValue('customer.email', input) }
        );

        F.equals(
            { field: 'id', control: FilterControl.text() },
            // @ts-expect-error 'customer.nope' is not a field of the row type
            { toQuery: (input, context) => context.result.fieldValue('customer.nope', input) }
        );
    });

    it('exposes the result builders to a running transform', () => {
        const expression = FilterExpr.equals({
            field: 'id',
            control: FilterControl.text(),
            transform: { toQuery: (input, context) => context.result.fieldValue('customer.email', input) }
        });
        const filterGroups: FilterGroups = [{
            name: 'basic',
            label: null,
            filters: [{ id: 'redirect', label: 'Redirect', expression, aiGenerated: false }]
        }];
        const state: FilterState = new Map([['redirect', { type: 'leaf', value: FilterValue.value('a@b.test') }]]);

        expect(hasuraFilterExpressionToObject(buildHasuraConditions(state, filterGroups)))
            .toEqual({ customer: { email: { _eq: 'a@b.test' } } });
    });

    it('requires a condition-returning transform for a customOperator control', () => {
        const operators = [{ label: 'equals', value: '_eq' }, { label: 'greater than', value: '_gt' }];

        filter({
            rowType: Row,
            id: 'amount',
            label: 'Amount',
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({ operators, valueControl: FilterControl.number() }),
                transform: { toQuery: (input, context) => context.transform.hasuraCustomOperator.toQuery(input, context) }
            })
        });

        filter({
            rowType: Row,
            id: 'no-transform',
            label: 'Bad',
            // @ts-expect-error a customOperator control without a transform throws at query time
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({ operators, valueControl: FilterControl.number() })
            })
        });

        filter({
            rowType: Row,
            id: 'value-transform',
            label: 'Bad',
            // @ts-expect-error a customOperator transform that returns a value throws at query time
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({ operators, valueControl: FilterControl.number() }),
                transform: { toQuery: input => TransformResult.value(input) }
            })
        });

        const wide: FilterTransform = { toQuery: input => TransformResult.value(input) };
        filter({
            rowType: Row,
            id: 'wide-transform',
            label: 'Bad',
            // @ts-expect-error a transform typed FilterTransform cannot promise a condition
            expression: FilterExpr.equals({
                field: 'amount',
                control: FilterControl.customOperator({ operators, valueControl: FilterControl.number() }),
                transform: wide
            })
        });
    });
});

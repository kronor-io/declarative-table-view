// Legacy filename retained; tests updated to new helper name.
import { buildGraphQLQueryVariables } from './data';
import { CollectionView, View } from './view';
import type { FilterGroups, FilterSchema } from './filters';
import { FilterControl } from '../dsl/filterControl';
import { FilterExpr } from '../dsl/filterExpr';
import { ColumnDefinition } from './column-definition';
import { FilterState, buildInitialFormState } from './state';
import { Hasura } from './graphql';

// Helper to create a minimal view for tests
const baseView: CollectionView = {
    title: 'Test',
    id: 'test',
    source: { type: 'collection', collectionName: 'testCollection' },
    columnDefinitions: [{ type: 'virtualColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }] } as ColumnDefinition],
    filterGroups: [] as FilterGroups,
    boolExpType: 'BoolExp',
    orderByType: '[OrderBy!]',
    paginationKey: 'id'
};

describe('buildGraphQLQueryVariables (legacy file name)', () => {
    it('builds variables with staticConditions and cursor', () => {
        const view: View = {
            ...baseView,
            staticConditions: [Hasura.condition('status', Hasura.eq('ACTIVE'))]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 25, 50);
        expect(vars.conditions).toEqual({ status: { _eq: 'ACTIVE' } });
        expect(vars.paginationCondition).toEqual({ id: { _lt: 50 } });
        expect(vars.rowLimit).toBe(25);
        expect(vars.orderBy).toEqual([{ id: 'DESC' }]);
    });

    it('builds variables with a user filter (no staticConditions, no cursor)', () => {
        const userFilter: FilterSchema = {
            id: 'f1',
            label: 'ID',
            expression: FilterExpr.equals({ field: 'id', control: FilterControl.text() }),
            aiGenerated: false
        };
        const view: View = {
            ...baseView,
            filterGroups: [{ name: 'default', label: null, filters: [userFilter] }]
        };
        const filterState: FilterState = new Map([[userFilter.id, buildInitialFormState(userFilter.expression)]]);
        // Override leaf value to simulate user input
        const existing = filterState.get(userFilter.id);
        if (existing && existing.type === 'leaf') {
            existing.value = { type: 'value', value: '123' };
        }
        const vars = buildGraphQLQueryVariables(view, filterState, 10, null);
        expect(vars.conditions).toEqual({ id: { _eq: '123' } });
        expect(vars.paginationCondition).toEqual({});
    });
});

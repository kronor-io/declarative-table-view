import { buildGraphQLQueryVariables } from './data';
import { View } from './view';
import { FilterSchemasAndGroups, FilterSchema, filterExpr, filterControl } from './filters';
import { ColumnDefinition } from './column-definition';
import { FilterState, buildInitialFormState } from './state';

// Helper to create a minimal view for tests
const baseView: Omit<View, 'title' | 'id'> & { title: string; id: string } = {
    title: 'Test',
    id: 'test',
    collectionName: 'testCollection',
    columnDefinitions: [{ type: 'virtualColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }] } as ColumnDefinition],
    filterSchema: { groups: [], filters: [] } as FilterSchemasAndGroups,
    boolExpType: 'BoolExp',
    orderByType: '[OrderBy!]',
    paginationKey: 'id'
};

describe('buildGraphQLQueryVariables', () => {
    it('builds variables with staticConditions and cursor', () => {
        const view: View = {
            ...baseView,
            staticConditions: [{ status: { _eq: 'ACTIVE' } }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 25, 50);
        expect(vars.conditions).toEqual({ _and: [{}, { status: { _eq: 'ACTIVE' } }] });
        expect(vars.paginationCondition).toEqual({ id: { _lt: 50 } });
        expect(vars.rowLimit).toBe(25);
        expect(vars.orderBy).toEqual([{ id: 'DESC' }]);
    });

    it('builds variables with staticOrdering (without pagination ordering included)', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, null);
        expect(vars.orderBy).toEqual([{ id: 'DESC' }, { status: 'ASC' }]);
    });

    it('builds variables with a user filter (no staticConditions, no cursor)', () => {
        const userFilter: FilterSchema = {
            id: 'f1',
            label: 'ID',
            expression: filterExpr.equals('id', filterControl.text()),
            group: 'default',
            aiGenerated: false
        };
        const view: View = {
            ...baseView,
            filterSchema: { groups: [], filters: [userFilter] }
        };
        const filterState: FilterState = new Map([[userFilter.id, buildInitialFormState(userFilter.expression)]]);
        const existing = filterState.get(userFilter.id);
        if (existing && existing.type === 'leaf') {
            existing.value = '123';
        }
        const vars = buildGraphQLQueryVariables(view, filterState, 10, null);
        expect(vars.conditions).toEqual({ id: { _eq: '123' } });
        expect(vars.paginationCondition).toEqual({});
    });
});

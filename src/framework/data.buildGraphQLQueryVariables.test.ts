import { buildGraphQLQueryVariables, getPaginationOrderFieldQueries } from './data';
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

describe('buildGraphQLQueryVariables', () => {
    it('builds variables with staticConditions and cursor', () => {
        const view: View = {
            ...baseView,
            staticConditions: [Hasura.condition('status', Hasura.eq('ACTIVE'))]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 25, { id: 50 });
        expect(vars.conditions).toEqual({ status: { _eq: 'ACTIVE' } });
        expect(vars.paginationCondition).toEqual({ id: { _lt: 50 } });
        expect(vars.rowLimit).toBe(25);
        expect(vars.orderBy).toEqual([{ id: 'DESC' }]);
    });

    it('respects paginationDirection=ASC for cursor condition and orderBy', () => {
        const view: View = {
            ...baseView,
            paginationDirection: 'ASC'
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 25, { id: 50 });
        expect(vars.paginationCondition).toEqual({
            _or: [
                { id: { _gt: 50 } },
                { id: { _isNull: true } }
            ]
        });
        expect(vars.orderBy).toEqual([{ id: 'ASC' }]);
    });

    it('builds variables with staticOrdering before the pagination key ordering', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, null);
        expect(vars.orderBy).toEqual([{ status: 'ASC' }, { id: 'DESC' }]);
    });

    it('builds nested orderBy objects for dotted staticOrdering fields and paginationKey', () => {
        const view: View = {
            ...baseView,
            paginationKey: 'customer.id',
            staticOrdering: [{ 'customer.profile.status': 'ASC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, null);

        expect(vars.orderBy).toEqual([
            { customer: { profile: { status: 'ASC' } } },
            { customer: { id: 'DESC' } }
        ]);
    });

    it('accepts native nested staticOrdering objects', () => {
        const view: View = {
            ...baseView,
            paginationKey: 'customer.id',
            staticOrdering: [{ customer: { profile: { status: 'ASC' } } }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, {
            customer: {
                profile: { status: 'READY' },
                id: 50
            }
        });

        expect(vars.orderBy).toEqual([
            { customer: { profile: { status: 'ASC' } } },
            { customer: { id: 'DESC' } }
        ]);
        expect(vars.paginationCondition).toEqual({
            _or: [
                {
                    _or: [
                        { customer: { profile: { status: { _gt: 'READY' } } } },
                        { customer: { profile: { status: { _isNull: true } } } }
                    ]
                },
                {
                    _and: [
                        { customer: { profile: { status: { _eq: 'READY' } } } },
                        { customer: { id: { _lt: 50 } } }
                    ]
                }
            ]
        });
    });

    it('builds a lexicographic cursor condition for staticOrdering and paginationKey', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }, { createdAt: 'DESC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, {
            status: 'READY',
            createdAt: '2026-06-24T12:00:00Z',
            id: 50
        });

        expect(vars.orderBy).toEqual([{ status: 'ASC' }, { createdAt: 'DESC' }, { id: 'DESC' }]);
        expect(vars.paginationCondition).toEqual({
            _or: [
                {
                    _or: [
                        { status: { _gt: 'READY' } },
                        { status: { _isNull: true } }
                    ]
                },
                {
                    _and: [
                        { status: { _eq: 'READY' } },
                        { createdAt: { _lt: '2026-06-24T12:00:00Z' } }
                    ]
                },
                {
                    _and: [
                        { status: { _eq: 'READY' } },
                        { createdAt: { _eq: '2026-06-24T12:00:00Z' } },
                        { id: { _lt: 50 } }
                    ]
                }
            ]
        });
    });

    it('uses isNull checks for null cursor values in ASC staticOrdering', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, { status: null, id: 50 });

        expect(vars.paginationCondition).toEqual({
            _and: [
                { status: { _isNull: true } },
                { id: { _lt: 50 } }
            ]
        });
    });

    it('uses isNull checks for null cursor values in DESC staticOrdering', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'DESC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, { status: null, id: 50 });

        expect(vars.paginationCondition).toEqual({
            _or: [
                { status: { _isNull: false } },
                {
                    _and: [
                        { status: { _isNull: true } },
                        { id: { _lt: 50 } }
                    ]
                }
            ]
        });
    });

    it('does not duplicate paginationKey ordering when staticOrdering already includes it', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }, { id: 'ASC' }]
        };
        const filterState: FilterState = new Map();
        const vars = buildGraphQLQueryVariables(view, filterState, 10, { status: 'READY', id: 50 });

        expect(vars.orderBy).toEqual([{ status: 'ASC' }, { id: 'ASC' }]);
        expect(vars.paginationCondition).toEqual({
            _or: [
                {
                    _or: [
                        { status: { _gt: 'READY' } },
                        { status: { _isNull: true } }
                    ]
                },
                {
                    _and: [
                        { status: { _eq: 'READY' } },
                        {
                            _or: [
                                { id: { _gt: 50 } },
                                { id: { _isNull: true } }
                            ]
                        }
                    ]
                }
            ]
        });
    });

    it('throws when a cursor is missing a static ordering field', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }]
        };
        const filterState: FilterState = new Map();

        expect(() => buildGraphQLQueryVariables(view, filterState, 10, { id: 50 }))
            .toThrow('Cannot build pagination cursor: missing value for ordered field "status"');
    });

    it('throws clearly for invalid nested staticOrdering directions', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ customer: { profile: { status: 'UP' } } } as any]
        };
        const filterState: FilterState = new Map();

        expect(() => buildGraphQLQueryVariables(view, filterState, 10, null))
            .toThrow('Invalid staticOrdering direction for field "customer.profile.status"');
    });

    it('returns static ordering fields that must be selected for pagination cursors', () => {
        const view: View = {
            ...baseView,
            staticOrdering: [{ status: 'ASC' }, { createdAt: 'DESC' }]
        };

        expect(getPaginationOrderFieldQueries(view)).toEqual([
            { type: 'valueQuery', field: 'status' },
            { type: 'valueQuery', field: 'createdAt' }
        ]);
    });

    it('returns nested static ordering field queries that must be selected for pagination cursors', () => {
        const view: View = {
            ...baseView,
            paginationKey: 'customer.id',
            staticOrdering: [{ 'customer.profile.status': 'ASC' }, { createdAt: 'DESC' }]
        };

        expect(getPaginationOrderFieldQueries(view)).toEqual([
            {
                type: 'objectQuery',
                field: 'customer',
                selectionSet: [
                    {
                        type: 'objectQuery',
                        field: 'profile',
                        selectionSet: [{ type: 'valueQuery', field: 'status' }]
                    }
                ]
            },
            { type: 'valueQuery', field: 'createdAt' }
        ]);
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
        const existing = filterState.get(userFilter.id);
        if (existing && existing.type === 'leaf') {
            existing.value = { type: 'value', value: '123' };
        }
        const vars = buildGraphQLQueryVariables(view, filterState, 10, null);
        expect(vars.conditions).toEqual({ id: { _eq: '123' } });
        expect(vars.paginationCondition).toEqual({});
    });
});

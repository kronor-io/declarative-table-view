import { fetchData } from './data';
import { View } from './view';
import { ColumnDefinition } from './column-definition';
import type { FilterGroups } from './filters';
import { Hasura } from './graphql';

// We only test merging logic; GraphQL call will be mocked.

describe('fetchData staticConditions merging', () => {
    const mockClient: any = {
        request: jest.fn()
    };
    let capturedVariables: any = null;
    const requestSpy = mockClient.request.mockImplementation((_query: string, _vars: any) => {
        capturedVariables = _vars;
        return Promise.resolve({ testCollection: [] });
    });

    const view: View = {
        title: 'Test',
        id: 'test',
        source: { type: 'collection', collectionName: 'testCollection' },
        columnDefinitions: [{ type: 'virtualColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }] } as ColumnDefinition],
        filterGroups: [] as FilterGroups,
        boolExpType: 'BoolExp',
        orderByType: '[OrderBy!]',
        paginationKey: 'id',
        staticConditions: [
            Hasura.condition('status', Hasura.eq('ACTIVE')),
            Hasura.condition('deleted_at', Hasura.isNull(true))
        ]
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('merges staticConditions when no user filters', async () => {
        const result = await fetchData({ client: mockClient, view, query: 'query', filterState: new Map(), rowLimit: 10, cursor: null });
        expect(requestSpy).toHaveBeenCalled();
        expect(capturedVariables.conditions).toEqual({
            _and: [
                { status: { _eq: 'ACTIVE' } },
                { deleted_at: { _isNull: true } }
            ]
        });
        // When no cursor is provided the separate paginationCondition variable is an empty object
        expect(capturedVariables.paginationCondition).toEqual({});
        expect(result.rows).toEqual([]);
    });

    it('provides pagination condition via separate variable', async () => {
        await fetchData({ client: mockClient, view, query: 'query', filterState: new Map(), rowLimit: 10, cursor: 50 });
        // The base conditions should only include user + static conditions (no pagination)
        expect(capturedVariables.conditions._and.length).toBe(2); // two static
        // Pagination condition is isolated in its own variable
        expect(capturedVariables.paginationCondition).toEqual({ id: { _lt: 50 } });
    });

    it('reads rows from a function root field', async () => {
        mockClient.request.mockResolvedValueOnce({ searchPayments: [] });

        const functionView: View = {
            title: 'Function Test',
            id: 'function-test',
            source: { type: 'function', functionName: 'searchPayments', args: { merchantId: 'merchant-123' } },
            columnDefinitions: [{ type: 'virtualColumn', id: 'id', data: [{ type: 'valueQuery', field: 'id' }] } as ColumnDefinition],
            filterGroups: [] as FilterGroups,
            boolExpType: 'BoolExp',
            orderByType: '[OrderBy!]',
            paginationKey: 'id'
        };

        const result = await fetchData({ client: mockClient, view: functionView, query: 'query', filterState: new Map(), rowLimit: 10, cursor: null });

        expect(result.rows).toEqual([]);
    });
});

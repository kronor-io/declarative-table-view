import { fetchData } from './data';
import { View } from './view';
import { ColumnDefinition } from './column-definition';
import { FilterSchemasAndGroups } from './filters';

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
        collectionName: 'testCollection',
        columnDefinitions: [{ type: 'virtualColumn', data: [{ type: 'field', path: 'id' }] } as ColumnDefinition],
        filterSchema: { groups: [], filters: [] } as FilterSchemasAndGroups,
        boolExpType: 'BoolExp',
        orderByType: '[OrderBy!]',
        paginationKey: 'id',
        staticConditions: [{ status: { _eq: 'ACTIVE' } }, { deleted_at: { _is_null: true } }]
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('merges staticConditions when no user filters', async () => {
        const result = await fetchData({ client: mockClient, view, query: 'query', filterState: new Map(), rowLimit: 10, cursor: null });
        expect(requestSpy).toHaveBeenCalled();
        expect(capturedVariables.conditions).toEqual({ _and: [{}, { status: { _eq: 'ACTIVE' } }, { deleted_at: { _is_null: true } }] });
        // When no cursor is provided the separate paginationCondition variable is an empty object
        expect(capturedVariables.paginationCondition).toEqual({});
        expect(result.rows).toEqual([]);
    });

    it('provides pagination condition via separate variable', async () => {
        await fetchData({ client: mockClient, view, query: 'query', filterState: new Map(), rowLimit: 10, cursor: 50 });
        // The base conditions should only include user + static conditions (no pagination)
        expect(capturedVariables.conditions._and.length).toBe(3); // {}, two static
        // Pagination condition is isolated in its own variable
        expect(capturedVariables.paginationCondition).toEqual({ id: { _lt: 50 } });
    });
});

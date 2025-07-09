import { GraphQLClient } from 'graphql-request';
import { FilterFormState } from '../components/FilterForm';
import { buildHasuraConditions } from '../framework/graphql';
import { View } from '../framework/view';

export const fetchData = async ({
    client,
    selectedView,
    filterState,
    rows,
    cursor
}: {
    client: GraphQLClient;
    selectedView: View<any, any>;
    filterState: FilterFormState[];
    rows: number;
    cursor: string | number | null;
}): Promise<any[]> => {
    try {
        let conditions = buildHasuraConditions(filterState);
        if (cursor !== null) {
            const pagKey = selectedView.paginationKey;
            const pagCond = { [pagKey]: { _lt: cursor } };
            // Always wrap in _and for pagination
            conditions = { _and: [conditions, pagCond] };
        }
        const variables = {
            conditions,
            limit: rows,
            orderBy: [{ [selectedView.paginationKey]: 'DESC' }],
        };
        const response = await client.request(selectedView.query, variables);
        const rowsFetched = selectedView.getResponseRows(response as any);
        return rowsFetched;
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
};

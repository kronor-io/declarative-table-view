import { GraphQLClient } from 'graphql-request';
import { FilterFormState } from '../components/FilterForm';
import { buildHasuraConditions } from '../framework/graphql';
import { View } from '../framework/view';

export const fetchData = async ({
    client,
    selectedView,
    filterState,
    rows,
    customFilterState,
    cursor,
    customRows,
}: {
    client: GraphQLClient;
    selectedView: View<any, any>;
    filterState: FilterFormState[];
    rows: number;
    customFilterState?: FilterFormState[];
    cursor?: string | number | null;
    customRows?: number;
}): Promise<any[]> => {
    try {
        let effectiveFilter: FilterFormState[];
        if (customFilterState) {
            effectiveFilter = customFilterState;
        } else {
            effectiveFilter = filterState;
        }
        let conditions = buildHasuraConditions(effectiveFilter);
        if (cursor != null) {
            const pagKey = selectedView.paginationKey;
            const pagCond = { [pagKey]: { _lt: cursor } };
            // Always wrap in _and for pagination
            conditions = { _and: [conditions, pagCond] };
        }
        const variables = {
            conditions,
            limit: customRows ?? rows,
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

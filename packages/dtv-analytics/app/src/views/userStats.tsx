import { DSL, FilterControl, FilterExpr, type View } from '@kronor/dtv';
import type { Period } from '../location';
import { UserStatsListRowType } from './dtv.generated-types.user-stats-list';

const count = (id: string, name: string, field: 'sessions' | 'mounts' | 'definitions' | 'filtersApplied' | 'fetches' | 'failedFetches' | 'savedFilters') =>
    DSL.column({
        rowType: UserStatsListRowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => data[field],
    });

/** The users of the period, of one definition when given, with how much they used it. */
export const userStatsView = (period: Period, definition: string | null, openUser: (userId: string) => void): View => DSL.view({
    id: 'user-stats-list',
    title: 'Users',
    source: {
        type: 'function',
        functionName: 'userStats',
        args: {
            period_from: period.from.toISOString(),
            period_to: period.to.toISOString(),
            with_impersonated: period.withImpersonated,
            p_definition: definition,
        },
    },
    boolExpType: 'UserStatsRowBoolExp',
    orderByType: '[UserStatsRowOrderBy!]',
    paginationKey: 'userId',
    paginationDirection: 'ASC',
    staticOrdering: [{ mounts: 'DESC' }],
    columnDefinitions: [
        DSL.column({
            rowType: UserStatsListRowType,
            id: 'name',
            name: 'User',
            orderBy: 'name',
            data: [DSL.valueQuery({ field: 'userId' }), DSL.valueQuery({ field: 'name' })],
            cellRenderer: ({ data }) => (
                <a href={`/user/${data.userId}`} onClick={event => { event.preventDefault(); openUser(data.userId); }}>
                    {data.name ?? `User ${data.userId}`}
                </a>
            ),
        }),
        count('sessions', 'Sessions', 'sessions'),
        count('mounts', 'Mounts', 'mounts'),
        count('definitions', 'Definitions', 'definitions'),
        count('filtersApplied', 'Filters applied', 'filtersApplied'),
        count('fetches', 'Fetches', 'fetches'),
        count('failedFetches', 'Failed fetches', 'failedFetches'),
        count('savedFilters', 'Saved filters', 'savedFilters'),
        DSL.column({
            rowType: UserStatsListRowType,
            id: 'lastAt',
            name: 'Last seen',
            orderBy: 'lastAt',
            data: [DSL.valueQuery({ field: 'lastAt' })],
            cellRenderer: ({ data }) => data.lastAt === null ? '' : new Date(data.lastAt).toLocaleString(),
        }),
    ],
    filterGroups: [
        DSL.filterGroup({
            name: 'default',
            label: null,
            filters: [
                DSL.filter({
                    rowType: UserStatsListRowType,
                    id: 'name',
                    label: 'User',
                    expression: FilterExpr.iLike({ field: 'name', control: FilterControl.text() }),
                }),
                DSL.filter({
                    rowType: UserStatsListRowType,
                    id: 'failedFetches',
                    label: 'Failed fetches at least',
                    expression: FilterExpr.greaterThanOrEqual({ field: 'failedFetches', control: FilterControl.number() }),
                }),
            ],
        }),
    ],
});

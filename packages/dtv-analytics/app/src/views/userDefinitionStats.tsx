import { DSL, FilterControl, FilterExpr, type View } from '@kronor/dtv';
import { formatMs } from '../charts/theme';
import type { Period } from '../location';
import { UserDefinitionStatsListRowType } from './dtv.generated-types.user-definition-stats-list';

const count = (id: string, name: string, field: 'sessions' | 'mounts' | 'filtersApplied' | 'fetches' | 'failedFetches' | 'lostEvents') =>
    DSL.column({
        rowType: UserDefinitionStatsListRowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => data[field],
    });

/** The definitions one user used in the period. */
export const userDefinitionStatsView = (userId: string, period: Period, openDefinition: (definition: string) => void): View => DSL.view({
    id: 'user-definition-stats-list',
    title: 'Definitions used',
    source: {
        type: 'function',
        functionName: 'definitionStats',
        args: {
            period_from: period.from.toISOString(),
            period_to: period.to.toISOString(),
            with_impersonated: period.withImpersonated,
            p_user_id: userId,
        },
    },
    boolExpType: 'DefinitionStatsRowBoolExp',
    orderByType: '[DefinitionStatsRowOrderBy!]',
    paginationKey: 'definition',
    paginationDirection: 'ASC',
    staticOrdering: [{ mounts: 'DESC' }],
    columnDefinitions: [
        DSL.column({
            rowType: UserDefinitionStatsListRowType,
            id: 'definition',
            name: 'Definition',
            orderBy: 'definition',
            data: [DSL.valueQuery({ field: 'definition' })],
            cellRenderer: ({ data }) => (
                <a href={`/view/${encodeURIComponent(data.definition)}`} onClick={event => { event.preventDefault(); openDefinition(data.definition); }}>
                    {data.definition}
                </a>
            ),
        }),
        count('sessions', 'Sessions', 'sessions'),
        count('mounts', 'Mounts', 'mounts'),
        count('filtersApplied', 'Filters applied', 'filtersApplied'),
        count('fetches', 'Fetches', 'fetches'),
        count('failedFetches', 'Failed fetches', 'failedFetches'),
        DSL.column({
            rowType: UserDefinitionStatsListRowType,
            id: 'p95FetchMs',
            name: 'Fetch p95',
            orderBy: 'p95FetchMs',
            data: [DSL.valueQuery({ field: 'p95FetchMs' })],
            cellRenderer: ({ data }) => formatMs(data.p95FetchMs),
        }),
        DSL.column({
            rowType: UserDefinitionStatsListRowType,
            id: 'medianTimeOnViewMs',
            name: 'Median time on view',
            orderBy: 'medianTimeOnViewMs',
            data: [DSL.valueQuery({ field: 'medianTimeOnViewMs' })],
            cellRenderer: ({ data }) => formatMs(data.medianTimeOnViewMs),
        }),
        count('lostEvents', 'Lost events', 'lostEvents'),
        DSL.column({
            rowType: UserDefinitionStatsListRowType,
            id: 'lastAt',
            name: 'Last used',
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
                    rowType: UserDefinitionStatsListRowType,
                    id: 'definition',
                    label: 'Definition',
                    expression: FilterExpr.iLike({ field: 'definition', control: FilterControl.text() }),
                }),
            ],
        }),
    ],
});

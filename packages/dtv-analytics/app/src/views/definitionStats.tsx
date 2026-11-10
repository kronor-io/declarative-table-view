import { DSL, FilterControl, FilterExpr, TransformResult, hasuraDSLforRowType, type View } from '@kronor/dtv';
import type { Period } from '../location';
import { DefinitionStatsListRowType } from './dtv.generated-types.definition-stats-list';

const rowType = DefinitionStatsListRowType;
const H = hasuraDSLforRowType(DefinitionStatsListRowType);

const count = (
    id: string,
    name: string,
    field: 'users' | 'sessions' | 'mounts' | 'popouts' | 'viewIds' | 'filtersApplied' | 'filteredApplications' | 'filterPanelOpens' | 'fetches' | 'failedFetches' | 'lostEvents' | 'cutShort',
) =>
    DSL.column({
        rowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => data[field],
    });

const milliseconds = (id: string, name: string, field: 'p50FetchMs' | 'p95FetchMs' | 'medianTimeOnViewMs') =>
    DSL.column({
        rowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => {
            const ms = data[field];
            if (ms === null) return '';
            return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
        },
    });

/** The definitions, with how they were used in the period: those nobody used too. */
export const definitionStatsView = (period: Period, openDefinition: (definition: string) => void): View => DSL.view({
    id: 'definition-stats-list',
    title: 'Definitions',
    source: {
        type: 'function',
        functionName: 'definitionStats',
        args: {
            period_from: period.from.toISOString(),
            period_to: period.to.toISOString(),
            with_impersonated: period.withImpersonated,
        },
    },
    boolExpType: 'DefinitionStatsRowBoolExp',
    orderByType: '[DefinitionStatsRowOrderBy!]',
    paginationKey: 'definition',
    paginationDirection: 'ASC',
    staticOrdering: [{ users: 'DESC' }, { mounts: 'DESC' }],
    columnDefinitions: [
        DSL.column({
            rowType: DefinitionStatsListRowType,
            id: 'definition',
            name: 'Definition',
            orderBy: 'definition',
            data: [DSL.valueQuery({ field: 'definition' }), DSL.valueQuery({ field: 'known' })],
            cellRenderer: ({ data }) => (
                <a href={`/view/${encodeURIComponent(data.definition)}`} onClick={event => { event.preventDefault(); openDefinition(data.definition); }}>
                    {data.definition}{data.known ? '' : ' (unknown)'}
                </a>
            ),
        }),
        count('users', 'Users', 'users'),
        count('sessions', 'Sessions', 'sessions'),
        count('mounts', 'Mounts', 'mounts'),
        count('popouts', 'Popouts', 'popouts'),
        count('viewIds', 'Views', 'viewIds'),
        count('filtersApplied', 'Filters applied', 'filtersApplied'),
        DSL.column({
            rowType: DefinitionStatsListRowType,
            id: 'filteredApplications',
            name: 'Setting a filter',
            orderBy: 'filteredApplications',
            data: [DSL.valueQuery({ field: 'filteredApplications' }), DSL.valueQuery({ field: 'filtersNeverSet' })],
            // A table used without filters, e.g. on a record's page
            cellRenderer: ({ data }) => data.filtersNeverSet ? 'none' : data.filteredApplications,
        }),
        count('filterPanelOpens', 'Filter panel opened', 'filterPanelOpens'),
        count('fetches', 'Fetches', 'fetches'),
        count('failedFetches', 'Failed fetches', 'failedFetches'),
        milliseconds('p50FetchMs', 'Fetch p50', 'p50FetchMs'),
        milliseconds('p95FetchMs', 'Fetch p95', 'p95FetchMs'),
        milliseconds('medianTimeOnViewMs', 'Median time on view', 'medianTimeOnViewMs'),
        count('cutShort', 'Without unmount', 'cutShort'),
        count('lostEvents', 'Lost events', 'lostEvents'),
        DSL.column({
            rowType: DefinitionStatsListRowType,
            id: 'firstSeen',
            name: 'First seen',
            orderBy: 'firstSeen',
            data: [DSL.valueQuery({ field: 'firstSeen' })],
            cellRenderer: ({ data }) => data.firstSeen === null ? '' : new Date(data.firstSeen).toLocaleDateString(),
        }),
    ],
    filterGroups: [
        DSL.filterGroup({
            name: 'default',
            label: null,
            filters: [
                DSL.filter({
                    rowType: DefinitionStatsListRowType,
                    id: 'definition',
                    label: 'Definition',
                    expression: FilterExpr.iLike({ field: 'definition', control: FilterControl.text() }),
                }),
                DSL.filter({
                    rowType: DefinitionStatsListRowType,
                    id: 'users',
                    label: 'Users at least',
                    expression: FilterExpr.greaterThanOrEqual({ field: 'users', control: FilterControl.number() }),
                }),
                DSL.filter({
                    rowType: DefinitionStatsListRowType,
                    id: 'used',
                    label: 'Use',
                    expression: FilterExpr.equals({
                        field: 'mounts',
                        control: FilterControl.dropdown({ items: [{ label: 'Used', value: 'used' }, { label: 'Unused', value: 'unused' }] }),
                        // Used: mounted at least once in the period
                        transform: {
                            toQuery: input => TransformResult.condition(H.condition('mounts', input === 'unused' ? H.eq(0) : H.gt(0))),
                        },
                    }),
                }),
                DSL.filter({
                    rowType: DefinitionStatsListRowType,
                    id: 'filtersNeverSet',
                    label: 'Filters',
                    expression: FilterExpr.equals({
                        field: 'filtersNeverSet',
                        control: FilterControl.dropdown({ items: [{ label: 'Never set', value: true }, { label: 'Set at least once', value: false }] }),
                    }),
                }),
                DSL.filter({
                    rowType: DefinitionStatsListRowType,
                    id: 'known',
                    label: 'Known to the host',
                    expression: FilterExpr.equals({
                        field: 'known',
                        control: FilterControl.dropdown({ items: [{ label: 'Known', value: true }, { label: 'Unknown', value: false }] }),
                    }),
                }),
            ],
        }),
    ],
});

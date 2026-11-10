import { DSL, FilterControl, FilterExpr, type View } from '@kronor/dtv';
import type { Period } from '../location';
import { SavedFilterStatsListRowType } from './dtv.generated-types.saved-filter-stats-list';

const text = (id: string, name: string, field: 'name' | 'filters') =>
    DSL.column({
        rowType: SavedFilterStatsListRowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => data[field],
    });

const date = (id: string, name: string, field: 'createdAt' | 'lastAppliedAt') =>
    DSL.column({
        rowType: SavedFilterStatsListRowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => data[field] === null ? '' : new Date(data[field]).toLocaleString(),
    });

/** The saved filters users keep, or one user keeps, with how often each was applied in the period. */
export const savedFilterStatsView = (
    period: Period,
    open: { user: (userId: string) => void; definition: (definition: string) => void },
    userId: string | null = null,
): View => DSL.view({
    id: 'saved-filter-stats-list',
    title: 'Saved filters',
    source: {
        type: 'function',
        functionName: 'savedFilterStats',
        args: {
            period_from: period.from.toISOString(),
            period_to: period.to.toISOString(),
            with_impersonated: period.withImpersonated,
            p_user_id: userId,
        },
    },
    boolExpType: 'SavedFilterStatsRowBoolExp',
    orderByType: '[SavedFilterStatsRowOrderBy!]',
    paginationKey: 'key',
    paginationDirection: 'ASC',
    staticOrdering: [{ applications: 'DESC' }, { createdAt: 'DESC' }],
    columnDefinitions: [
        text('name', 'Saved filter', 'name'),
        ...userId !== null ? [] : [DSL.column({
            rowType: SavedFilterStatsListRowType,
            id: 'userName',
            name: 'User',
            orderBy: 'userName',
            data: [DSL.valueQuery({ field: 'userId' }), DSL.valueQuery({ field: 'userName' })],
            cellRenderer: ({ data }) => (
                <a href={`/user/${data.userId}`} onClick={event => { event.preventDefault(); open.user(data.userId); }}>
                    {data.userName ?? `User ${data.userId}`}
                </a>
            ),
        })],
        DSL.column({
            rowType: SavedFilterStatsListRowType,
            id: 'viewId',
            name: 'View',
            orderBy: 'viewId',
            data: [DSL.valueQuery({ field: 'viewId' }), DSL.valueQuery({ field: 'definition' })],
            cellRenderer: ({ data }) => data.definition === null ? `${data.viewId} (unknown)` : (
                <a href={`/view/${encodeURIComponent(data.definition)}`} onClick={event => { event.preventDefault(); open.definition(data.definition ?? ''); }}>
                    {data.viewId}
                </a>
            ),
        }),
        text('filters', 'Filters it sets', 'filters'),
        DSL.column({
            rowType: SavedFilterStatsListRowType,
            id: 'applications',
            name: 'Applied in the period',
            orderBy: 'applications',
            data: [DSL.valueQuery({ field: 'applications' })],
            cellRenderer: ({ data }) => data.applications,
        }),
        date('lastAppliedAt', 'Last applied', 'lastAppliedAt'),
        date('createdAt', 'Created', 'createdAt'),
    ],
    filterGroups: [
        DSL.filterGroup({
            name: 'default',
            label: null,
            filters: [
                DSL.filter({
                    rowType: SavedFilterStatsListRowType,
                    id: 'name',
                    label: 'Saved filter',
                    expression: FilterExpr.iLike({ field: 'name', control: FilterControl.text() }),
                }),
                ...userId !== null ? [] : [DSL.filter({
                    rowType: SavedFilterStatsListRowType,
                    id: 'userName',
                    label: 'User',
                    expression: FilterExpr.iLike({ field: 'userName', control: FilterControl.text() }),
                })],
                DSL.filter({
                    rowType: SavedFilterStatsListRowType,
                    id: 'definition',
                    label: 'Definition',
                    expression: FilterExpr.iLike({ field: 'definition', control: FilterControl.text() }),
                }),
                DSL.filter({
                    rowType: SavedFilterStatsListRowType,
                    id: 'filters',
                    label: 'Sets the filter',
                    expression: FilterExpr.iLike({ field: 'filters', control: FilterControl.text() }),
                }),
                DSL.filter({
                    rowType: SavedFilterStatsListRowType,
                    id: 'notApplied',
                    label: 'Applied',
                    expression: FilterExpr.equals({
                        field: 'applications',
                        control: FilterControl.dropdown({ items: [{ label: 'Not in the period', value: 0 }] }),
                    }),
                }),
            ],
        }),
    ],
});

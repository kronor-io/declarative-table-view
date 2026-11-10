import { DSL, FilterControl, FilterExpr, type View } from '@kronor/dtv';
import type { Period } from '../location';
import { FilterStatsListRowType } from './dtv.generated-types.filter-stats-list';

const count = (id: string, name: string, field: 'applications' | 'users' | 'keptBy' | 'inSavedFilters') =>
    DSL.column({
        rowType: FilterStatsListRowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => data[field],
    });

/** The filters of a definition, with how often they were set in the period and what users keep. */
export const filterStatsView = (definition: string, period: Period): View => DSL.view({
    id: 'filter-stats-list',
    title: 'Filters',
    source: {
        type: 'function',
        functionName: 'filterStats',
        args: {
            p_definition: definition,
            period_from: period.from.toISOString(),
            period_to: period.to.toISOString(),
            with_impersonated: period.withImpersonated,
        },
    },
    boolExpType: 'FilterStatsRowBoolExp',
    orderByType: '[FilterStatsRowOrderBy!]',
    paginationKey: 'filterId',
    paginationDirection: 'ASC',
    staticOrdering: [{ applications: 'DESC' }],
    columnDefinitions: [
        DSL.column({
            rowType: FilterStatsListRowType,
            id: 'filterId',
            name: 'Filter',
            orderBy: 'filterId',
            data: [DSL.valueQuery({ field: 'filterId' }), DSL.valueQuery({ field: 'inDefinition' }), DSL.valueQuery({ field: 'removed' })],
            cellRenderer: ({ data }) => `${data.filterId}${data.removed || !data.inDefinition ? ' (removed)' : ''}`,
        }),
        count('applications', 'Applications that set it', 'applications'),
        count('users', 'Users', 'users'),
        count('keptBy', 'Kept between visits by', 'keptBy'),
        count('inSavedFilters', 'In saved filters', 'inSavedFilters'),
        DSL.column({
            rowType: FilterStatsListRowType,
            id: 'inDefinition',
            name: 'In the definition',
            orderBy: 'inDefinition',
            data: [DSL.valueQuery({ field: 'inDefinition' })],
            cellRenderer: ({ data }) => data.inDefinition ? 'yes' : 'no, removed',
        }),
    ],
    filterGroups: [
        DSL.filterGroup({
            name: 'default',
            label: null,
            filters: [
                DSL.filter({
                    rowType: FilterStatsListRowType,
                    id: 'filterId',
                    label: 'Filter',
                    expression: FilterExpr.iLike({ field: 'filterId', control: FilterControl.text() }),
                }),
                DSL.filter({
                    rowType: FilterStatsListRowType,
                    id: 'unused',
                    label: 'Unused',
                    expression: FilterExpr.equals({
                        field: 'applications',
                        control: FilterControl.dropdown({ items: [{ label: 'Unused only', value: 0 }] }),
                    }),
                }),
            ],
        }),
    ],
});

import { DSL, FilterControl, FilterExpr, type View } from '@kronor/dtv';
import type { Period } from '../location';
import { ErrorGroupsListRowType } from './dtv.generated-types.error-groups-list';

/** What failed, by the event DTV reported it with. */
export const ERROR_TYPES = [
    { label: 'Requests for rows', value: 'fetch' },
    { label: 'Actions', value: 'action' },
    { label: 'Row expansions', value: 'rowExpansionLoad' },
    { label: 'AI assistant', value: 'aiFilter' },
    { label: 'Loading user data', value: 'userDataLoad' },
    { label: 'Saving user data', value: 'userDataSaveFailed' },
    { label: 'Unresolved user data conflicts', value: 'userDataConflict' },
    { label: 'Unreadable user data', value: 'userDataReadOnly' },
    { label: 'Filters changed since stored', value: 'filtersChangedSinceSnapshot' },
    { label: 'Filter suggestions', value: 'suggestionsFailed' },
] as const;

export const errorTypeLabel = (type: string) => ERROR_TYPES.find(t => t.value === type)?.label ?? type;

const date = (id: string, name: string, field: 'firstAt' | 'lastAt') =>
    DSL.column({
        rowType: ErrorGroupsListRowType,
        id,
        name,
        orderBy: field,
        data: [DSL.valueQuery({ field })],
        cellRenderer: ({ data }) => new Date(data[field]).toLocaleString(),
    });

/** The period's errors, the same ones together: what failed, where, how and how often. */
export const errorGroupsView = (period: Period, openDefinition: (definition: string) => void): View => DSL.view({
    id: 'error-groups-list',
    title: 'Errors',
    source: {
        type: 'function',
        functionName: 'errorGroups',
        args: {
            period_from: period.from.toISOString(),
            period_to: period.to.toISOString(),
            with_impersonated: period.withImpersonated,
        },
    },
    boolExpType: 'ErrorGroupRowBoolExp',
    orderByType: '[ErrorGroupRowOrderBy!]',
    paginationKey: 'key',
    paginationDirection: 'ASC',
    staticOrdering: [{ errors: 'DESC' }, { lastAt: 'DESC' }],
    columnDefinitions: [
        DSL.column({
            rowType: ErrorGroupsListRowType,
            id: 'type',
            name: 'What failed',
            orderBy: 'type',
            data: [DSL.valueQuery({ field: 'type' })],
            cellRenderer: ({ data }) => errorTypeLabel(data.type),
        }),
        DSL.column({
            rowType: ErrorGroupsListRowType,
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
        DSL.column({
            rowType: ErrorGroupsListRowType,
            id: 'kind',
            name: 'Kind',
            orderBy: 'kind',
            data: [DSL.valueQuery({ field: 'kind' })],
            cellRenderer: ({ data }) => data.kind,
        }),
        DSL.column({
            rowType: ErrorGroupsListRowType,
            id: 'message',
            name: 'Message',
            orderBy: 'message',
            data: [DSL.valueQuery({ field: 'message' })],
            cellRenderer: ({ data }) => data.message,
        }),
        DSL.column({
            rowType: ErrorGroupsListRowType,
            id: 'errors',
            name: 'Times',
            orderBy: 'errors',
            data: [DSL.valueQuery({ field: 'errors' })],
            cellRenderer: ({ data }) => data.errors,
        }),
        DSL.column({
            rowType: ErrorGroupsListRowType,
            id: 'users',
            name: 'Users',
            orderBy: 'users',
            data: [DSL.valueQuery({ field: 'users' })],
            cellRenderer: ({ data }) => data.users,
        }),
        date('firstAt', 'First', 'firstAt'),
        date('lastAt', 'Last', 'lastAt'),
    ],
    filterGroups: [
        DSL.filterGroup({
            name: 'default',
            label: null,
            filters: [
                DSL.filter({
                    rowType: ErrorGroupsListRowType,
                    id: 'type',
                    label: 'What failed',
                    expression: FilterExpr.in({ field: 'type', control: FilterControl.multiselect({ items: [...ERROR_TYPES] }) }),
                }),
                DSL.filter({
                    rowType: ErrorGroupsListRowType,
                    id: 'definition',
                    label: 'Definition',
                    expression: FilterExpr.iLike({ field: 'definition', control: FilterControl.text() }),
                }),
                DSL.filter({
                    rowType: ErrorGroupsListRowType,
                    id: 'message',
                    label: 'Message',
                    expression: FilterExpr.iLike({ field: 'message', control: FilterControl.text() }),
                }),
            ],
        }),
    ],
});

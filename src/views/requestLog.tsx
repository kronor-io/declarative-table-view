import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";
import { ColumnDefinition, field } from "../framework/column-definition";
import { DateTime, Left } from "../components/LayoutHelpers";
import { View } from "../framework/view";

const columnDefinitions: ColumnDefinition[] = [
    {
        data: ['merchantId'].map(field),
        name: 'Merchant',
        cellRenderer: ({ data: { merchantId } }) =>
            (({ 1: 'Boozt', 2: 'Boozt Dev' } as any)[merchantId])
    },
    {
        data: ['createdAt'].map(field),
        name: 'Date',
        cellRenderer: ({ data: { createdAt } }) =>
            <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />
    },
    {
        data: ['idempotencyKey'].map(field),
        name: 'Idempotency Key',
        cellRenderer: ({ data: { idempotencyKey } }) =>
            <div className="whitespace-pre-wrap">{idempotencyKey}</div>
    },
    {
        data: ['namespace'].map(field),
        name: 'Namespace',
        cellRenderer: ({ data: { namespace } }) =>
            <div className="whitespace-pre-wrap">{namespace}</div>
    },
    {
        data: ['requestParams'].map(field),
        name: 'Request',
        cellRenderer: ({ data: { requestParams } }) =>
            <Left>
                <pre className="text-left">{JSON.stringify(requestParams, null, 2)}</pre>
            </Left>
    },
    {
        data: ['responseBody'].map(field),
        name: 'Response',
        cellRenderer: ({ data: { responseBody } }) =>
            <Left>
                <pre>{JSON.stringify(responseBody, null, 2)}</pre>
            </Left>
    }
];

const filterGroups = [
    { name: 'default', label: 'Default Filters' }
];

const filterSchema: FilterFieldSchema = {
    groups: filterGroups,
    filters: [
        {
            label: 'Date',
            expression: Filter.range('createdAt', Control.date),
            group: 'default',
            aiGenerated: false
        }
    ]
};

const collectionName = 'requestsLog';

const RequestLogView: View = {
    title: 'Requests',
    routeName: 'request-logs',
    collectionName,
    columnDefinitions,
    filterSchema,
    boolExpType: 'RequestLogBoolExp',
    orderByType: '[RequestLogOrderBy!]',
    paginationKey: 'createdAt',
};

export default RequestLogView;

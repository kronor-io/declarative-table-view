import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";
import { ColumnDefinition } from "../framework/column-definition";
import { generateGraphQLQuery } from "../framework/graphql";
import { DateTime, Left } from "../components/LayoutHelpers";
import { View } from "../framework/view";

const columnDefinitions: ColumnDefinition[] = [
    {
        data: ['merchantId'],
        name: 'Merchant',
        cellRenderer: ({ data: { merchantId } }) =>
            (({ 1: 'Boozt', 2: 'Boozt Dev' } as any)[merchantId])
    },
    {
        data: ['createdAt'],
        name: 'Date',
        cellRenderer: ({ data: { createdAt } }) =>
            <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />
    },
    {
        data: ['idempotencyKey'],
        name: 'Idempotency Key',
        cellRenderer: ({ data: { idempotencyKey } }) =>
            <div className="whitespace-pre-wrap">{idempotencyKey}</div>
    },
    {
        data: ['namespace'],
        name: 'Namespace',
        cellRenderer: ({ data: { namespace } }) =>
            <div className="whitespace-pre-wrap">{namespace}</div>
    },
    {
        data: ['requestParams'],
        name: 'Request',
        cellRenderer: ({ data: { requestParams } }) =>
            <Left>
                <pre className="text-left">{JSON.stringify(requestParams, null, 2)}</pre>
            </Left>
    },
    {
        data: ['responseBody'],
        name: 'Response',
        cellRenderer: ({ data: { responseBody } }) =>
            <Left>
                <pre>{JSON.stringify(responseBody, null, 2)}</pre>
            </Left>
    }
];

const filterSchema: FilterFieldSchema = [
    {
        label: 'Date',
        expression: Filter.range('createdAt', Control.date)
    }
];

const collectionName = 'requestsLog';

type QueryResponse = {
    [_ in typeof collectionName]: any[];
};

const RequestLogView: View<any, QueryResponse> = {
    title: 'Requests',
    routeName: 'request-logs',
    collectionName,
    columnDefinitions,
    filterSchema,
    query: generateGraphQLQuery(
        collectionName,
        columnDefinitions,
        "RequestLogBoolExp",
        "[RequestLogOrderBy!]"
    ),
    getResponseRows: (response: QueryResponse) => response[collectionName],
    QueryResponseType: {} as QueryResponse,
    paginationKey: 'createdAt',
};

export default RequestLogView;

import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../framework/filters";
import { ColumnDefinition, field, defaultCellRenderer, queryConfigs } from "../framework/column-definition";
import { generateGraphQLQuery } from "../framework/graphql";
import { CurrencyAmount, DateTime, Left, Right, VStack } from "../components/LayoutHelpers";
import { PaymentMethod } from "./PaymentMethod";
import { View } from "../framework/view";
import { Mapping } from "../components/Mapping";
import { PaymentStatusTag } from '../components/PaymentStatusTag';
import { PhoneNumberFilter } from "../components/PhoneNumberFilter";
import NoRowsExtendDateRange from "./NoRowsExtendDateRange";

export type PaymentRequest = {
    transactionId: string;
    waitToken: string;
    merchantId: string;
    amount: number;
    currency: string;
    paymentProvider: string;
    reference: string;
    createdAt: string;
    customer: {
        name: string;
        email: string;
        packedPhoneNumber: string;
    };
    payment?: {
        paymentRefundStatus: string;
    };
    attempts: {
        cardType: string;
    }[];
};

const columnDefinitions: ColumnDefinition[] = [
    {
        data: ['transactionId', 'waitToken'].map(field),
        name: 'Transaction',
        cellRenderer: ({ data: { transactionId, waitToken } }) =>
            <a className="underline" href={`/${waitToken}`}>{transactionId}</a>
    },
    {
        data: ['merchantId'].map(field),
        name: 'Merchant',
        cellRenderer: ({ data: { merchantId } }) =>
            <Mapping value={merchantId} map={{ 1: 'Boozt', 2: 'Boozt Dev' }} />
    },
    {
        data: ['createdAt'].map(field),
        name: 'Placed At',
        cellRenderer: ({ data: { createdAt } }) =>
            <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />
    },
    { data: ['reference'].map(field), name: 'Reference', cellRenderer: defaultCellRenderer },
    {
        data: [
            field('paymentProvider'),
            queryConfigs([
                { data: 'attempts', limit: 1, orderBy: { key: 'createdAt', direction: 'DESC' } },
                { data: 'cardType' }
            ])
        ],
        name: 'Provider',
        cellRenderer: ({ data }) =>
            <PaymentMethod paymentMethod={data.paymentProvider} cardType={data['attempts.cardType']} darkmode={false} />
    },
    {
        data: ['customer.name', 'customer.email'].map(field),
        name: 'Initiated By',
        cellRenderer: ({ data }) =>
            <Left>
                <VStack align="start">
                    <span className="font-bold">{data['customer.name']}</span>
                    {data['customer.email']}
                </VStack>
            </Left>
    },
    {
        data: ['currentStatus'].map(field),
        name: 'Status',
        cellRenderer: ({ data }) => <PaymentStatusTag status={data.currentStatus} />
    },
    {
        data: ['currency', 'amount'].map(field),
        name: 'Amount',
        cellRenderer: ({ data: { currency, amount } }) =>
            <Right>
                <CurrencyAmount amount={Number(amount) / 100} currency={currency} />
            </Right>
    }
    // { data: ['customer.packedPhoneNumber'], name: 'Customer Phone', cellRenderer: defaultCellRenderer }
    // { data: ['customer.device.fingerprint'], name: 'Device Fingerprint', cellRenderer: defaultCellRenderer },
    // { data: ['payment.paymentRefundStatus'], name: 'Refund Status', cellRenderer: defaultCellRenderer }
];

const filterSchema: FilterFieldSchema = [
    { label: 'Transaction ID', expression: Filter.equals('transactionId', Control.text()) },
    {
        label: 'Amount',
        expression:
            Filter.range(
                'amount',
                Control.number,
                {
                    fromQuery: (input: any) => input / 100,
                    toQuery: (input: any) => input * 100
                }
            )
    },
    {
        label: 'Placed At',
        expression: Filter.and([
            Filter.greaterThanOrEqual(
                'createdAt',
                Control.date({ placeholder: 'from', initialValue: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })() })
            ),
            Filter.lessThanOrEqual(
                'createdAt',
                Control.date({ placeholder: 'to', initialValue: new Date() })
            )
        ])
    },
    {
        label: 'Currency',
        expression:
            Filter.in(
                'currency',
                Control.multiselect(
                    {
                        items: [
                            { label: 'SEK', value: 'SEK' },
                            { label: 'EUR', value: 'EUR' },
                            { label: 'DKK', value: 'DKK' },
                            { label: 'ISK', value: 'ISK' },
                            { label: 'CHF', value: 'CHF' },
                            { label: 'CZK', value: 'CZK' },
                            { label: 'HUF', value: 'HUF' },
                            { label: 'NOK', value: 'NOK' },
                            { label: 'PLN', value: 'PLN' },
                            { label: 'RON', value: 'RON' },
                            { label: 'GBP', value: 'GBP' },
                            { label: 'USD', value: 'USD' }
                        ]
                    }
                )
            )
    },
    {
        label: 'Customer Email',
        expression: Filter.equals('customer.email', Control.customOperator({ operators: [{ label: 'equals', value: '_eq' }, { label: 'not equals', value: '_neq' }], valueControl: Control.text() }))
        // expression: Filter.equals('customer.email', Control.customOperator({ operators: Filter.allOperators, valueControl: Control.text() }))
    },
    {
        label: 'Merchant',
        expression: Filter.in('merchantId', Control.multiselect(
            {
                items: [
                    { label: 'Boozt', value: 1 },
                    { label: 'Boozt Dev', value: 2 }
                ]
            }
        ))
    },
    {
        label: 'Payment Status',
        expression: Filter.in('currentStatus', Control.multiselect({
            items: [
                { label: 'Cancelled', value: 'CANCELLED' },
                { label: 'Paid', value: 'PAID' },
                { label: 'Error', value: 'ERROR' },
                { label: 'Declined', value: 'DECLINED' },
                { label: 'Preflight Check', value: 'PRE_FLIGHT_CHECK' },
                { label: 'Initializing', value: 'INITIALIZING' },
                { label: 'Waiting', value: 'WAITING_FOR_PAYMENT' },
                { label: 'Promoting', value: 'WAITING_FOR_PROMOTION' },
                { label: 'Cancelling', value: 'CANCELLING' },
                { label: 'Flow Completed', value: 'FLOW_COMPLETED' },
                { label: 'Authorized', value: 'AUTHORIZED' },
                { label: 'Partially Captured', value: 'PARTIALLY_CAPTURED' },
                { label: 'Capture Declined', value: 'CAPTURE_DECLINED' },
                { label: 'Payment Released', value: 'RELEASED' },
            ],
            filterable: true
        }))
    },
    {
        label: 'Payment Provider',
        expression: Filter.in('paymentProvider', Control.multiselect({
            items: [
                { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
                { label: 'Credit Card', value: 'CREDIT_CARD' },
                { label: 'Direct Debit', value: 'DIRECT_DEBIT' },
                { label: 'MobilePay', value: 'MOBILEPAY' },
                { label: 'P24', value: 'P24' },
                { label: 'PayPal', value: 'PAYPAL' },
                { label: 'Swish', value: 'SWISH' },
                { label: 'Vipps', value: 'VIPPS' }
            ]
        }))
    },
    {
        label: 'Customer Phone',
        expression: Filter.equals(
            'customer.packedPhoneNumber',
            Control.custom(PhoneNumberFilter)
        )
    }
];

const collectionName = 'paymentRequests';

type QueryResponse = {
    [_ in typeof collectionName]: PaymentRequest[];
};

const PaymentRequestView: View<PaymentRequest, QueryResponse> = {
    title: 'Payment Requests',
    routeName: 'payment-requests',
    collectionName,
    columnDefinitions,
    filterSchema,
    query: generateGraphQLQuery(
        collectionName,
        columnDefinitions,
        "PaymentRequestBoolExp",
        "[PaymentRequestOrderBy!]"
    ),
    getResponseRows: (response: QueryResponse) => response[collectionName],
    QueryResponseType: {} as QueryResponse,
    paginationKey: 'createdAt',
    noRowsComponent: NoRowsExtendDateRange
};

export default PaymentRequestView;

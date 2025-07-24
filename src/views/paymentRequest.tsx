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
    // { data: ['customer.device.fingerprint'].map(field), name: 'Fingerprint', cellRenderer: defaultCellRenderer },
    // { data: ['payment.paymentRefundStatus'].map(field), name: 'Payment Refund Status', cellRenderer: defaultCellRenderer },
    // {
    //     data: [
    //         queryConfigs([
    //             { data: 'attempts', limit: 1, orderBy: { key: 'createdAt', direction: 'DESC' } },
    //             { data: 'maskedCard' }
    //         ])
    //     ],
    //     name: 'Provider',
    //     cellRenderer: ({ data }) =>
    //         data['attempts.maskedCard'][0]
    // },
    {
        data: [
            field('paymentProvider'),
            queryConfigs([
                { field: 'attempts', limit: 1, orderBy: { key: 'createdAt', direction: 'DESC' } },
                { field: 'cardType' }
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
];

const filterGroups = [
    { name: 'default', label: null },
    { name: 'customer', label: 'Customer Filters' },
    { name: 'credit-card', label: 'Credit Card Filters' },
    { name: 'additional', label: 'Additional Filters' }
];

const filterSchema: FilterFieldSchema = {
    groups: filterGroups,
    filters: [
        {
            label: 'Merchant',
            expression: Filter.in('merchantId', Control.multiselect({
                items: [
                    { label: 'Boozt', value: 1 },
                    { label: 'Boozt Dev', value: 2 }
                ]
            })),
            group: 'default',
            aiGenerated: false
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
            })),
            group: 'default',
            aiGenerated: false
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
            })),
            group: 'default',
            aiGenerated: false
        },
        {
            label: 'Reference',
            expression: Filter.equals(
                'reference',
                Control.customOperator({
                    operators: [
                        { label: 'equals', value: '_eq' },
                        { label: 'starts with', value: '_like' }
                    ],
                    valueControl: Control.text()
                }),
                {
                    fromQuery: (input: any) => {
                        if (input.operator === '_like') {
                            return { ...input, value: input.value.replace(/%$/, '') };
                        }
                        return input;
                    },
                    toQuery: (input: any) => {
                        if (input.operator === '_like') {
                            return { ...input, value: `${input.value}%` };
                        }
                        return input;
                    }
                }
            ),
            group: 'default',
            aiGenerated: false
        },
        { label: 'Payment ID', expression: Filter.equals('resultingPaymentId', Control.text()), group: 'default', aiGenerated: false },
        {
            label: 'Customer Email',
            expression: Filter.equals(
                'customer.email',
                Control.customOperator({
                    operators: [
                        { label: 'equals', value: '_eq' },
                        { label: 'not equals', value: '_neq' }
                    ],
                    valueControl: Control.text()
                })
            ),
            group: 'default',
            aiGenerated: false
        },
        { label: 'Customer Name', expression: Filter.iLike('customer.name', Control.text()), group: 'customer', aiGenerated: false },
        {
            label: 'Date Range',
            expression: Filter.and([
                Filter.greaterThanOrEqual(
                    'createdAt',
                    Control.date({ placeholder: 'from', initialValue: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })() })
                ),
                Filter.lessThanOrEqual(
                    'createdAt',
                    Control.date({ placeholder: 'to', initialValue: new Date() })
                )
            ]),
            group: 'default',
            aiGenerated: false
        },
        {
            label: 'Reference 2',
            expression: Filter.equals(
                'merchantReference2',
                Control.customOperator({
                    operators: [
                        { label: 'equals', value: '_eq' },
                        { label: 'starts with', value: '_like' }
                    ],
                    valueControl: Control.text()
                }),
                {
                    fromQuery: (input: any) => {
                        if (input.operator === '_like') {
                            return { ...input, value: input.value.replace(/%$/, '') };
                        }
                        return input;
                    },
                    toQuery: (input: any) => {
                        if (input.operator === '_like') {
                            return { ...input, value: `${input.value}%` };
                        }
                        return input;
                    }
                }
            ),
            group: 'default',
            aiGenerated: false
        },
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
                ),
            group: 'additional',
            aiGenerated: false
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
                ),
            group: 'additional',
            aiGenerated: false
        },
        {
            label: 'Refund Status',
            expression: Filter.in('payment.paymentRefundStatus', Control.multiselect({
                items: [
                    { label: 'Fully Refunded Payments', value: 'FULLY_REFUNDED' },
                    { label: 'Partially Refunded Payments', value: 'PARTIALLY_REFUNDED' },
                    { label: 'Payments With No Refunds', value: 'NO_REFUND' }
                ]
            })),
            group: 'additional',
            aiGenerated: false
        },
        {
            label: 'Device Fingerprint',
            expression: Filter.equals('customer.device.fingerprint', Control.text()),
            group: 'additional',
            aiGenerated: false
        },
        {
            label: 'Card Type',
            expression: Filter.in('attempts.cardType', Control.multiselect({
                items: [
                    { label: 'American Express', value: 'amex' },
                    { label: 'China Union Pay', value: 'china_union_pay' },
                    { label: 'Dankort', value: 'dankort' },
                    { label: 'Diners', value: 'diners' },
                    { label: 'Discover', value: 'discover' },
                    { label: 'Forbrugsforeningen', value: 'ffk' },
                    { label: 'JCB', value: 'jcb' },
                    { label: 'Maestro', value: 'maestro' },
                    { label: 'MasterCard', value: 'mc' },
                    { label: 'Visa Electron', value: 'visa_elec' },
                    { label: 'Visa-DK', value: 'visa_dk' },
                    { label: 'Visa', value: 'visa' }
                ]
            })),
            group: 'credit-card',
            aiGenerated: false
        },
        {
            label: 'Credit Card Number',
            expression: Filter.iLike('attempts.maskedCard', Control.text(), {
                toQuery: (input: any) => `%${input}%`,
                fromQuery: (input: any) => input.replace(/%/g, '') // Remove % for display
            }),
            group: 'credit-card',
            aiGenerated: false
        },
        {
            label: 'Customer Phone',
            expression: Filter.equals(
                'customer.packedPhoneNumber',
                Control.custom(PhoneNumberFilter)
            ),
            group: 'customer',
            aiGenerated: false
        }
    ]
};

const collectionName = 'paymentRequests';

const PaymentRequestView: View = {
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
    paginationKey: 'createdAt',
    noRowsComponent: NoRowsExtendDateRange
};

export default PaymentRequestView;

import { FilterFieldSchema, filterExpr as Filter, filterControl as Control } from "../../framework/filters";
import { ColumnDefinition, field, queryConfigs } from "../../framework/column-definition";
import { View } from "../../framework/view";
import { PhoneNumberFilter } from "../../components/PhoneNumberFilter";
import NoRowsExtendDateRange from "./NoRowsExtendDateRange";
import { paymentRequestsRuntime } from "./runtime";

interface KronorPortalContext {
    portalHost: string
}

const columnDefinitions: ColumnDefinition<KronorPortalContext>[] = [
    {
        data: ['transactionId', 'waitToken'].map(field),
        name: 'Transaction',
        cellRenderer: paymentRequestsRuntime.cellRenderers.transaction
    },
    {
        data: ['merchantId'].map(field),
        name: 'Merchant',
        cellRenderer: paymentRequestsRuntime.cellRenderers.merchant
    },
    {
        data: ['createdAt'].map(field),
        name: 'Placed At',
        cellRenderer: paymentRequestsRuntime.cellRenderers.placedAt
    },
    {
        data: ['reference'].map(field),
        name: 'Reference',
        cellRenderer: paymentRequestsRuntime.cellRenderers.reference
    },
    {
        data: [
            field('paymentProvider'),
            queryConfigs([
                { field: 'attempts', limit: 1, orderBy: { key: 'createdAt', direction: 'DESC' } },
                { field: 'cardType' }
            ])
        ],
        name: 'Provider',
        cellRenderer: paymentRequestsRuntime.cellRenderers.paymentProvider
    },
    {
        data: ['customer.name', 'customer.email'].map(field),
        name: 'Initiated By',
        cellRenderer: paymentRequestsRuntime.cellRenderers.initiatedBy
    },
    {
        data: ['currentStatus'].map(field),
        name: 'Status',
        cellRenderer: paymentRequestsRuntime.cellRenderers.status
    },
    {
        data: ['currency', 'amount'].map(field),
        name: 'Amount',
        cellRenderer: paymentRequestsRuntime.cellRenderers.amount
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
                paymentRequestsRuntime.queryTransforms.reference
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
                paymentRequestsRuntime.queryTransforms.reference
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
                    paymentRequestsRuntime.queryTransforms.amount
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
            expression: Filter.iLike('attempts.maskedCard', Control.text(), paymentRequestsRuntime.queryTransforms.creditCardNumber),
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

const PaymentRequestView: View<KronorPortalContext> = {
    title: 'Payment Requests',
    routeName: 'payment-requests',
    collectionName,
    columnDefinitions,
    filterSchema,
    boolExpType: 'PaymentRequestBoolExp',
    orderByType: '[PaymentRequestOrderBy!]',
    paginationKey: 'createdAt',
    noRowsComponent: NoRowsExtendDateRange
};

export default PaymentRequestView;

// @ts-expect-error React is required for JSX even though not explicitly referenced
import React from "react";
import { CellRenderer } from "../../framework/column-definition";
import { CurrencyAmount, DateTime, FlexColumn, FlexRow } from "../../components/LayoutHelpers";
import { PaymentMethod } from "./components/PaymentMethod";
import { Mapping } from "../../components/Mapping";
import { PaymentStatusTag } from './components/PaymentStatusTag';
import { defaultCellRenderer } from "../../framework/column-definition";
import { NoRowsComponent } from "../../framework/view";
import NoRowsExtendDateRange from "./components/NoRowsExtendDateRange";
import { PhoneNumberFilter } from "../../components/PhoneNumberFilter";
import { Runtime } from "../../framework/runtime";

// Static runtime configuration for payment requests view
export type PaymentRequestsRuntime = Runtime & {
    cellRenderers: {
        transaction: CellRenderer;
        merchant: CellRenderer;
        placedAt: CellRenderer;
        reference: CellRenderer;
        paymentProvider: CellRenderer;
        initiatedBy: CellRenderer;
        status: CellRenderer;
        amount: CellRenderer;
    };
    queryTransforms: {
        reference: {
            fromQuery: (input: any) => any;
            toQuery: (input: any) => any;
        };
        amount: {
            fromQuery: (input: any) => any;
            toQuery: (input: any) => any;
        };
        creditCardNumber: {
            fromQuery: (input: any) => any;
            toQuery: (input: any) => any;
        };
    };
    noRowsComponents: {
        noRowsExtendDateRange: NoRowsComponent;
    };
    customFilterComponents: {
        PhoneNumberFilter: any;
    };
    initialValues: {
        dateRangeStart: Date;
        dateRangeEnd: Date;
    };
};

// Static object of cell renderers for payment requests
export const paymentRequestsRuntime: PaymentRequestsRuntime = {
    cellRenderers: {
        // Transaction cell renderer
        transaction: ({ data: { transactionId, waitToken } }) => {
            const url = `/portal/payment-requests/${waitToken}`;
            return <a className="underline" href={url}>{transactionId}</a>;
        },

        // Merchant cell renderer
        merchant: ({ data: { merchantId } }) =>
            <Mapping value={merchantId} map={{ 1: 'Boozt', 2: 'Boozt Dev' }} />,

        // Placed At cell renderer
        placedAt: ({ data: { createdAt } }) =>
            <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />,

        // Reference cell renderer
        reference: defaultCellRenderer,

        // Payment Provider cell renderer
        paymentProvider: ({ data }) =>
            <PaymentMethod paymentMethod={data.paymentProvider} cardType={data['attempts.cardType']} darkmode={false} />,

        // Initiated By cell renderer
        initiatedBy: ({ data, setFilterState, applyFilters }) => {
            const handleEmailClick = () => {
                setFilterState(currentState =>
                    currentState.map(filter => {
                        // Find the customer email filter and update its value
                        if (filter.type === 'leaf' && filter.field === 'customer.email') {
                            return {
                                ...filter,
                                value: { operator: '_eq', value: data['customer.email'] }
                            };
                        }
                        return filter;
                    })
                );
                applyFilters();
            };

            return (
                <FlexRow align="center" justify="start">
                    <FlexColumn align="start">
                        <span className="font-bold">{data['customer.name']}</span>
                        <button
                            className="text-blue-500 underline hover:text-blue-700 cursor-pointer text-left"
                            onClick={handleEmailClick}
                            title={`Filter by email: ${data['customer.email']}`}
                        >
                            {data['customer.email']}
                        </button>
                    </FlexColumn>
                </FlexRow>
            );
        },

        // Status cell renderer
        status: ({ data }) => <PaymentStatusTag status={data.currentStatus} />,

        // Amount cell renderer
        amount: ({ data: { currency, amount } }) =>
            <FlexRow align="center" justify="end">
                <CurrencyAmount amount={Number(amount) / 100} currency={currency} />
            </FlexRow>
    },

    // Transform functions for filter values
    queryTransforms: {
        // Transform for Reference filter (starts with functionality)
        reference: {
            fromQuery: (input: any) => {
                if (input.operator === '_like') {
                    return { ...input, value: input.value.replace(/%$/, '') };
                }
                return input;
            },
            toQuery: (input: any) => {
                if (input.operator === '_like') {
                    return { value: { ...input, value: `${input.value}%` } };
                }
                return { value: input };
            }
        },

        // Transform for Amount filter (convert between display and storage format)
        amount: {
            fromQuery: (input: any) => input / 100,
            toQuery: (input: any) => ({ value: input * 100 })
        },

        // Transform for Credit Card Number filter (add wildcards)
        creditCardNumber: {
            toQuery: (input: any) => ({ value: `%${input}%` }),
            fromQuery: (input: any) => input.replace(/%/g, '') // Remove % for display
        }
    },

    // No-rows components
    noRowsComponents: {
        noRowsExtendDateRange: NoRowsExtendDateRange
    },
    customFilterComponents: {
        PhoneNumberFilter
    },

    // Initial values for filters
    initialValues: {
        // Date range: one month back from current date
        dateRangeStart: (() => {
            const date = new Date();
            date.setMonth(date.getMonth() - 1);
            return date; // Return Date object for calendar component
        })(),
        dateRangeEnd: (() => {
            const date = new Date();
            return date; // Return Date object for calendar component
        })()
    }
};

import { CellRenderer } from "../../framework/column-definition";
import { PaymentMethod } from "./components/PaymentMethod";
import { PaymentStatusTag } from './components/PaymentStatusTag';
import { Runtime } from "../../framework/runtime";
import * as FilterValue from "../../framework/filterValue";
import { TransformResult as TR } from '../../framework/filters';
import type { TransformResult } from '../../framework/filters';

// Static runtime configuration for payment requests view
export type PaymentRequestsRuntime = Runtime & {
    cellRenderers: {
        transaction: CellRenderer;
        merchant: CellRenderer;
        placedAt: CellRenderer;
        paymentProvider: CellRenderer;
        initiatedBy: CellRenderer;
        status: CellRenderer;
        amount: CellRenderer;
    };
    queryTransforms: {
        reference: {
            toQuery: (input: unknown) => TransformResult;
        };
        amount: {
            toQuery: (input: unknown) => TransformResult;
        };
        creditCardNumber: {
            toQuery: (input: unknown) => TransformResult;
        };
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
            return <a className="tw:underline" href={url}>{transactionId}</a>;
        },

        // Merchant cell renderer
        merchant: ({ data: { merchantId }, components: { Mapping } }) =>
            <Mapping value={merchantId} map={{ 1: 'Boozt', 2: 'Boozt Dev' }} />,

        // Placed At cell renderer
        placedAt: ({ data: { createdAt }, components: { DateTime } }) =>
            <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />,

        // Payment Provider cell renderer
        paymentProvider: ({ data }) =>
            <PaymentMethod paymentMethod={data.paymentProvider} cardType={data.attempts?.[0]?.cardType} darkmode={false} />,

        // Initiated By cell renderer
        initiatedBy: ({ data, updateFilterById, applyFilters, components: { FlexColumn, FlexRow } }) => {
            const handleEmailClick = () => {
                // 'customer-email' is the filter id defined in view.json
                const email = data.customer?.email;
                if (!email) {
                    return;
                }
                updateFilterById('customer-email', (currentFilter) => {
                    return {
                        ...currentFilter,
                        value: FilterValue.value({ operator: '_eq', value: FilterValue.value(email) })
                    };
                });
                applyFilters();
            };

            return (
                <FlexRow align="center" justify="start">
                    <FlexColumn align="start">
                        <span className="tw:font-bold">{data.customer?.name}</span>
                        <button
                            className="tw:text-blue-500 tw:underline hover:tw:text-blue-700 tw:cursor-pointer tw:text-left"
                            onClick={handleEmailClick}
                            title={`Filter by email: ${data.customer?.email}`}
                        >
                            {data.customer?.email}
                        </button>
                    </FlexColumn>
                </FlexRow>
            );
        },

        // Status cell renderer
        status: ({ data }) => <PaymentStatusTag status={data.currentStatus} />,

        // Amount cell renderer
        amount: ({ data: { currency, amount }, components: { CurrencyAmount, FlexRow }, currency: { minorToMajor } }) =>
            <FlexRow align="center" justify="end">
                <CurrencyAmount amount={minorToMajor(Number(amount), currency)} currency={currency} />
            </FlexRow>
    },

    // Transform functions for filter values
    queryTransforms: {
        // Transform for Reference filter (starts with functionality)
        reference: {
            toQuery: (input: unknown) => {
                if (!input || typeof input !== 'object') {
                    return TR.empty();
                }

                const record = input as { operator?: unknown; value?: unknown };
                const operator = record.operator;
                const value = record.value;

                if (operator === '_like' && typeof value === 'string' && value !== '') {
                    return TR.value({ ...record, operator, value: `${value}%` });
                }

                return TR.value(input);
            }
        },

        // Transform for Amount filter (convert between display and storage format)
        amount: {
            toQuery: (input: unknown) => {
                if (typeof input === 'number') {
                    return TR.value(input * 100);
                }
                return TR.empty();
            }
        },

        // Transform for Credit Card Number filter (add wildcards)
        creditCardNumber: {
            toQuery: (input: unknown) => {
                if (typeof input === 'string' && input !== '') {
                    return TR.value(`%${input}%`);
                }
                return TR.empty();
            }
        },

        transactionId: {
            toQuery: (input: unknown) => {
                if (!input || typeof input !== 'object') {
                    return TR.empty();
                }

                const record = input as { value?: unknown };
                const value = record.value;
                if (typeof value === 'string' && value !== '') {
                    return TR.value(value);
                }
                return TR.empty();
            }
        }
    },

    noRowsComponents: {},

    customFilterComponents: {},

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
    },
    suggestionFetchers: {
        transactionId: async (query: string, client) => {
            try {
                const gql =
                    `query TransactionIdSuggestions($where: PaymentRequestBoolExp!, $limit: Int!) {
                        paymentRequests(where: $where, limit: $limit, orderBy: [{ createdAt: DESC }]) {
                            transactionId
                        }
                    }`;
                const variables = {
                    where: { transactionId: { _ilike: `${query}%` } },
                    limit: 10
                };
                const data: any = await client.request(gql, variables);
                const rows = data?.paymentRequests ?? [];
                return rows.map((r: any) => ({ label: `${r.transactionId}`, value: r.transactionId }));
            } catch (e) {
                console.warn('transactionId suggestionFetcher error', e);
                return [];
            }
        }
    }
};

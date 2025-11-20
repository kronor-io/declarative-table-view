import { CellRenderer } from "../../framework/column-definition";
import { PaymentMethod } from "./components/PaymentMethod";
import { PaymentStatusTag } from './components/PaymentStatusTag';
import { Runtime } from "../../framework/runtime";

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
            toQuery: (input: any) => any;
        };
        amount: {
            toQuery: (input: any) => any;
        };
        creditCardNumber: {
            toQuery: (input: any) => any;
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
            <PaymentMethod paymentMethod={data.paymentProvider} cardType={data['attempts.cardType']} darkmode={false} />,

        // Initiated By cell renderer
        initiatedBy: ({ data, updateFilterById, applyFilters, components: { FlexColumn, FlexRow } }) => {
            const handleEmailClick = () => {
                // 'customer-email' is the filter id defined in view.json
                updateFilterById('customer-email', (currentFilter: any) => {
                    return {
                        ...currentFilter,
                        value: { operator: '_eq', value: data['customer.email'] }
                    };
                });
                applyFilters();
            };

            return (
                <FlexRow align="center" justify="start">
                    <FlexColumn align="start">
                        <span className="tw:font-bold">{data['customer.name']}</span>
                        <button
                            className="tw:text-blue-500 tw:underline hover:tw:text-blue-700 tw:cursor-pointer tw:text-left"
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
        amount: ({ data: { currency, amount }, components: { CurrencyAmount, FlexRow }, currency: { minorToMajor } }) =>
            <FlexRow align="center" justify="end">
                <CurrencyAmount amount={minorToMajor(Number(amount), currency)} currency={currency} />
            </FlexRow>
    },

    // Transform functions for filter values
    queryTransforms: {
        // Transform for Reference filter (starts with functionality)
        reference: {
            toQuery: (input: any) => {
                if (input.operator === '_like' && input.value) {
                    return { value: { ...input, value: `${input.value}%` } };
                }
                return { value: input };
            }
        },

        // Transform for Amount filter (convert between display and storage format)
        amount: {
            toQuery: (input: any) => {
                if (input) {
                    return { value: input * 100 };
                }
                return { value: input };
            }
        },

        // Transform for Credit Card Number filter (add wildcards)
        creditCardNumber: {
            toQuery: (input: any) => {
                if (input) {
                    return { value: `%${input}%` };
                }
                return { value: input };
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
                return rows.map((r: any) => r.transactionId);
            } catch (e) {
                console.warn('transactionId suggestionFetcher error', e);
                return [];
            }
        }
    }
};

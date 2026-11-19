import type { AggregateState } from "../../framework/aggregates";
import type { CellRenderer, FooterRenderer } from "../../framework/column-definition";
import type { Runtime } from "../../framework/runtime";

type Totals = { count: number; sum: { amount: number | null } | null };

const totalsOf = (state: AggregateState | undefined): Totals | null =>
    state?.state === 'ready' ? state.data as Totals : null;

// What a footer shows while its aggregate loads, or when it failed
const pending = (state: AggregateState | undefined) => (state?.state === 'error' ? 'Total unavailable' : 'Loading total…');

/** The amount, and its share of the total of all the rows the filters match. */
const amountShare: CellRenderer<{ amount: number }> = ({ data, aggregates }) => {
    const total = totalsOf(aggregates.totals)?.sum?.amount;
    if (!total) return `$${data.amount}`;
    return `$${data.amount} (${(data.amount / total * 100).toFixed(1)}%)`;
};

const amountTotal: FooterRenderer = ({ aggregates }) => {
    const totals = totalsOf(aggregates.totals);
    return <span data-testid="footer-amount-total">{totals ? `Total: $${totals.sum?.amount ?? 0}` : pending(aggregates.totals)}</span>;
};

const largeCount: FooterRenderer = ({ aggregates }) => {
    const large = aggregates.large;
    return (
        <span data-testid="footer-large-count">
            {large?.state === 'ready' ? `Over $200: ${(large.data as { count: number }).count}` : pending(large)}
        </span>
    );
};

export const aggregatesTestViewRuntime: Runtime = {
    cellRenderers: {
        text: ({ data }) => String(Object.values(data)[0] ?? ''),
        amountShare: amountShare as CellRenderer
    },
    footerRenderers: {
        amountTotal,
        largeCount
    },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

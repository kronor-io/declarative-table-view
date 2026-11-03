import { CellRenderer } from "../../framework/column-definition";
import { DateTime, FlexRow } from "../../framework/cell-renderer-components/LayoutHelpers";
import { Runtime } from "../../framework/runtime";

// Merchant cell renderer
const merchantNames: Record<number, string> = { 1: 'Boozt', 2: 'Boozt Dev' };
const merchantCellRenderer: CellRenderer<{ merchantId: number }> = ({ data: { merchantId } }) =>
    merchantNames[merchantId];

// Date cell renderer
const dateCellRenderer: CellRenderer<{ createdAt: string }> = ({ data: { createdAt } }) =>
    <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />;

// Idempotency key cell renderer
const idempotencyKeyCellRenderer: CellRenderer<{ idempotencyKey: string | null }> = ({ data: { idempotencyKey } }) =>
    <div className="tw:whitespace-pre-wrap">{idempotencyKey}</div>;

// Namespace cell renderer
const namespaceCellRenderer: CellRenderer<{ namespace: string | null }> = ({ data: { namespace } }) =>
    <div className="tw:whitespace-pre-wrap">{namespace}</div>;

// JSON cell renderer for request params
const jsonCellRenderer: CellRenderer = ({ data: { requestParams } }) =>
    <FlexRow align="center" justify="start">
        <pre className="tw:text-left">{JSON.stringify(requestParams, null, 2)}</pre>
    </FlexRow>;

// JSON response cell renderer
const jsonResponseCellRenderer: CellRenderer = ({ data: { responseBody } }) =>
    <FlexRow align="center" justify="start">
        <pre>{JSON.stringify(responseBody, null, 2)}</pre>
    </FlexRow>;

// Runtime configuration for request log view
export const requestLogViewRuntime: Runtime = {
    cellRenderers: {
        merchantCellRenderer,
        dateCellRenderer,
        idempotencyKeyCellRenderer,
        namespaceCellRenderer,
        jsonCellRenderer,
        jsonResponseCellRenderer
    },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {}
};

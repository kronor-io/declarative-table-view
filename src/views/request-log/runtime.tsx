import { CellRenderer } from "../../framework/column-definition";
import { DateTime, FlexRow } from "../../framework/cell-renderer-components/LayoutHelpers";
import { Runtime } from "../../framework/runtime";

// Merchant cell renderer
const merchantCellRenderer: CellRenderer = ({ data: { merchantId } }) =>
    (({ 1: 'Boozt', 2: 'Boozt Dev' } as any)[merchantId]);

// Date cell renderer
const dateCellRenderer: CellRenderer = ({ data: { createdAt } }) =>
    <DateTime date={createdAt} options={{ dateStyle: "long", timeStyle: "medium" }} />;

// Idempotency key cell renderer
const idempotencyKeyCellRenderer: CellRenderer = ({ data: { idempotencyKey } }) =>
    <div className="whitespace-pre-wrap">{idempotencyKey}</div>;

// Namespace cell renderer
const namespaceCellRenderer: CellRenderer = ({ data: { namespace } }) =>
    <div className="whitespace-pre-wrap">{namespace}</div>;

// JSON cell renderer for request params
const jsonCellRenderer: CellRenderer = ({ data: { requestParams } }) =>
    <FlexRow align="center" justify="start">
        <pre className="text-left">{JSON.stringify(requestParams, null, 2)}</pre>
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
    initialValues: {}
};

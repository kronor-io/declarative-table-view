import type { RowExpansionRenderer } from '../../framework/view';
import { Runtime } from '../../framework/runtime';
import { simpleTestViewRuntime } from '../simple-test-view/runtime';

type DetailsData = { details?: { note?: string | null; owner?: string | null } | null; email?: string };

const detailsRowExpansion: RowExpansionRenderer<DetailsData> = ({ row, data, collapse, createElement, components: { FlexColumn, FlexRow } }) => {
    return createElement('div', {
        className: 'tw:px-4 tw:py-3 tw:bg-slate-50',
        children: createElement(FlexColumn, {
            gap: 'gap-2',
            children: [
                createElement(FlexRow, {
                    key: 'summary',
                    justify: 'between',
                    children: [
                        createElement('strong', { children: `Details for ${row.testField}` }),
                        createElement('button', {
                            type: 'button',
                            className: 'tw:text-blue-600 hover:tw:text-blue-800 tw:underline',
                            onClick: collapse,
                            children: 'Collapse'
                        })
                    ]
                }),
                createElement('div', {
                    key: 'note',
                    children: data.details?.note ?? 'No details available'
                }),
                createElement('div', {
                    key: 'owner',
                    children: `Owner: ${data.details?.owner ?? 'Unknown'}`
                }),
                createElement('div', {
                    key: 'email',
                    children: `Email: ${data.email}`
                })
            ]
        })
    });
};

export const rowExpansionTestViewRuntime: Runtime = {
    ...simpleTestViewRuntime,
    rowExpansions: {
        detailsRowExpansion: {
            render: detailsRowExpansion,
            canExpand: ({ data }: { data: DetailsData }) => Boolean(data.details?.note)
        }
    }
};

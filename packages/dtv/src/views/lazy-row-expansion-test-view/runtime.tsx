import { Runtime } from '../../framework/runtime';
import { simpleTestViewRuntime } from '../simple-test-view/runtime';

const detailsRowExpansion = ({ row, data, state, collapse, createElement, components: { FlexColumn, FlexRow } }: any) => {
    if (state === 'loading') {
        return createElement('div', {
            className: 'tw:px-4 tw:py-3 tw:flex tw:items-center tw:gap-2 tw:text-slate-600',
            children: [
                createElement('i', { key: 'spinner', className: 'pi pi-spin pi-spinner', 'aria-hidden': true }),
                createElement('span', { key: 'text', children: 'Loading details...' })
            ]
        });
    }

    if (state === 'error') {
        return createElement('div', {
            className: 'tw:px-4 tw:py-3 tw:text-red-600',
            children: 'Failed to load details.'
        });
    }

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

export const lazyRowExpansionTestViewRuntime: Runtime = {
    ...simpleTestViewRuntime,
    rowExpansions: {
        detailsRowExpansion: {
            render: detailsRowExpansion,
            canExpand: ({ row }) => Boolean(row.email)
        }
    }
};

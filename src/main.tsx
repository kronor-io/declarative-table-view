import { StrictMode, createRef } from 'react'
import type { RowSelectionAPI } from './components/Table';
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrimeReactProvider } from 'primereact/api';
import { Runtime } from './framework/runtime';
import { ActionDefinition } from './framework/actions.ts';
import packageFile from '../package.json';

export interface RenderTableViewOptions {
    graphqlHost: string;
    graphqlToken: string;
    geminiApiKey: string;
    viewsJson: string; // JSON string containing array of view definitions
    showViewsMenu?: boolean; // Controls whether the views menu is shown
    showViewTitle?: boolean; // Option to show/hide view title
    showCsvExportButton?: boolean; // Option to show/hide CSV export button
    showPopoutButton?: boolean; // Option to show/hide Popout button (default true)
    externalRuntime?: Runtime; // Optional external runtime that takes precedence over built-in runtimes
    syncFilterStateToUrl?: boolean; // When true, keeps current filter state encoded in URL param `dtv-filter-state`
    rowSelection?: {
        rowSelectionType: 'none' | 'multiple';
        onRowSelectionChange?: (rows: any[]) => void;
        apiRef?: React.RefObject<RowSelectionAPI | null>;
    };
    actions?: ActionDefinition[]; // Optional custom action buttons
    rowClassFunction?: (row: Record<string, any>) => Record<string, boolean>;
    rowsPerPageOptions?: number[]; // custom page size options for pagination dropdown
}


function renderTableView(target: HTMLElement | string, options: RenderTableViewOptions) {
    const reactContainer = typeof target === 'string' ? document.getElementById(target) : target;
    if (!reactContainer) throw new Error('Target element not found');

    createRoot(reactContainer).render(
        <StrictMode>
            <PrimeReactProvider value={{}}>
                <App
                    graphqlHost={options.graphqlHost}
                    graphqlToken={options.graphqlToken}
                    geminiApiKey={options.geminiApiKey}
                    showViewsMenu={options.showViewsMenu ?? false}
                    showViewTitle={options.showViewTitle ?? false}
                    showCsvExportButton={options.showCsvExportButton ?? false}
                    showPopoutButton={options.showPopoutButton ?? true}
                    viewsJson={options.viewsJson}
                    externalRuntime={options.externalRuntime}
                    syncFilterStateToUrl={options.syncFilterStateToUrl ?? false}
                    rowSelection={options.rowSelection}
                    actions={options.actions}
                    rowClassFunction={options.rowClassFunction}
                    rowsPerPageOptions={options.rowsPerPageOptions}
                />
            </PrimeReactProvider>
        </StrictMode>
    );
}

// Public namespace object
export const dtv = {
    version: packageFile.version,
    renderTableView
};

// Expose namespace on window (script-tag consumers)
// @ts-expect-error Expose dtv namespace globally
window.dtv = dtv;

// In development, preload views based on URL parameter or load payment requests by default
if (import.meta.env.DEV) {
    const rootEl = document.getElementById('root');
    if (rootEl) {
        // Async wrapper function to load view and runtime
        const loadView = async (viewModule: any, runtimeModule: any) => {
            const viewJson = JSON.parse(viewModule.default);
            const runtime = Object.values(runtimeModule)[0] as Runtime;

            const urlParams = new URLSearchParams(window.location.search);
            const rowSelectionTypeParam = urlParams.get('rowSelectionType');
            const rowSelection = rowSelectionTypeParam ? {
                rowSelectionType: (rowSelectionTypeParam === 'multiple' ? 'multiple' : 'none') as 'multiple' | 'none',
                onRowSelectionChange: (rows: any[]) => { (window as any).__lastSelection = rows; },
                apiRef: createRef<RowSelectionAPI>()
            } : undefined;


            // Expose for tests to call rowSelection.apiRef.current.resetRowSelection later
            (window as any).__rowSelection = rowSelection;
            renderTableView(rootEl, {
                graphqlHost: import.meta.env.VITE_GRAPHQL_HOST,
                graphqlToken: import.meta.env.VITE_GRAPHQL_TOKEN,
                geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY,
                viewsJson: JSON.stringify([viewJson]),
                showViewsMenu: false,
                externalRuntime: runtime,
                syncFilterStateToUrl: urlParams.get('sync-filter-state-to-url') === 'true',
                showPopoutButton: urlParams.get('show-popout-button') === 'false' ? false : true,
                rowSelection
            });
        };

        (async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const testView = urlParams.get('test-view');

            switch (testView) {
                case 'payment-requests':
                    await loadView(
                        await import('./views/payment-requests/view.json?raw'),
                        await import('./views/payment-requests/runtime')
                    );
                    break;
                case 'request-log':
                    await loadView(
                        await import('./views/request-log/view.json?raw'),
                        await import('./views/request-log/runtime')
                    );
                    break;
                case 'simple-test-view':
                    await loadView(
                        await import('./views/simple-test-view/view.json?raw'),
                        await import('./views/simple-test-view/runtime')
                    );
                    break;
                default:
                    await loadView(
                        await import('./views/payment-requests/view.json?raw'),
                        await import('./views/payment-requests/runtime')
                    );
                    break;
            }
        })();
    }
}

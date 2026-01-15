import { createRef } from 'react'
import type { RowSelectionAPI } from './components/Table';
import './index.css'
import { Runtime } from './framework/runtime';
import packageFile from '../package.json';
import { renderTableView, type RenderTableViewOptions } from './lib/renderTableView.tsx';

export type { RenderTableViewOptions }

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

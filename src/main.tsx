import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrimeReactProvider } from 'primereact/api';
import { Runtime } from './framework/runtime';

export interface RenderTableViewOptions {
    graphqlHost: string;
    graphqlToken: string;
    geminiApiKey: string;
    viewsJson: string; // JSON string containing array of view definitions
    showViewsMenu?: boolean; // Controls whether the views menu is shown
    showViewTitle?: boolean; // Option to show/hide view title
    externalRuntime?: Runtime; // Optional external runtime that takes precedence over built-in runtimes
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
                    viewsJson={options.viewsJson}
                    externalRuntime={options.externalRuntime}
                />
            </PrimeReactProvider>
        </StrictMode>
    );
}

// Make renderTableView available globally
// @ts-expect-error Adding renderTableView to window object for global access
window.renderTableView = renderTableView;

// In development, preload views based on URL parameter or load payment requests by default
if (import.meta.env.DEV) {
    const rootEl = document.getElementById('root');
    if (rootEl) {
        // Async wrapper function to load view and runtime
        const loadView = async (viewModule: any, runtimeModule: any) => {
            const viewJson = JSON.parse(viewModule.default);
            const runtime = Object.values(runtimeModule)[0] as Runtime;

            renderTableView(rootEl, {
                graphqlHost: import.meta.env.VITE_GRAPHQL_HOST,
                graphqlToken: import.meta.env.VITE_GRAPHQL_TOKEN,
                geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY,
                viewsJson: JSON.stringify([viewJson]),
                showViewsMenu: false,
                externalRuntime: runtime
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

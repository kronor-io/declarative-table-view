import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrimeReactProvider } from 'primereact/api';

export interface RenderTableViewOptions {
    graphqlHost: string;
    graphqlToken: string;
    geminiApiKey: string;
    showViewsMenu?: boolean; // Controls whether the views menu is shown
    showViewTitle?: boolean; // Option to show/hide view title
    cellRendererContext?: unknown; // Context passed to all cell renderers
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
                    cellRendererContext={options.cellRendererContext}
                />
            </PrimeReactProvider>
        </StrictMode>
    );
}

// Make renderTableView available globally
// @ts-expect-error Adding renderTableView to window object for global access
window.renderTableView = renderTableView;

// In development, auto-mount for hot reload if #root exists
if (import.meta.env.DEV) {
    const rootEl = document.getElementById('root');
    if (rootEl) {
        renderTableView(rootEl, {
            graphqlHost: import.meta.env.VITE_GRAPHQL_HOST,
            graphqlToken: import.meta.env.VITE_GRAPHQL_TOKEN,
            geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY,
            cellRendererContext: { /* example context object */ }
        });
    }
}

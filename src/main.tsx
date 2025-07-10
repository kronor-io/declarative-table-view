import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import style from './index.css?inline'
import App from './App.tsx'
import { PrimeReactProvider } from 'primereact/api';

export interface RenderTableViewOptions {
  graphqlHost: string;
  graphqlToken: string;
  geminiApiKey: string;
  showViewsMenu?: boolean; // Controls whether the views menu is shown
  showViewTitle?: boolean; // Option to show/hide view title
}

function renderTableView(target: HTMLElement | string, options: RenderTableViewOptions) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) throw new Error('Target element not found');

  const shadowRoot = el.attachShadow({ mode: 'open' });

  const reactContainer = document.createElement('div');
  reactContainer.id = 'react-root';
  shadowRoot.appendChild(reactContainer);

  const primeReactOptions = {
    styleContainer: shadowRoot
  };

  createRoot(reactContainer).render(
    <>
      <style>{style}</style>
      <StrictMode>
        <PrimeReactProvider value={primeReactOptions}>
          <App
            graphqlHost={options.graphqlHost}
            graphqlToken={options.graphqlToken}
            geminiApiKey={options.geminiApiKey}
            showViewsMenu={options.showViewsMenu ?? false}
            showViewTitle={options.showViewTitle ?? false}
          />
        </PrimeReactProvider>
      </StrictMode>
    </>
  );
}

// Make renderTableView available globally
// @ts-ignore
window.renderTableView = renderTableView;

// In development, auto-mount for hot reload if #root exists
if (import.meta.env.DEV) {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    renderTableView(rootEl, {
      graphqlHost: import.meta.env.VITE_GRAPHQL_HOST,
      graphqlToken: import.meta.env.VITE_GRAPHQL_TOKEN,
      geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY,
    });
  }
}

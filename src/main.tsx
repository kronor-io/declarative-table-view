import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

export interface RenderTableViewOptions {
  graphqlHost: string;
  graphqlToken: string;
}

function renderTableView(target: HTMLElement | string, options: RenderTableViewOptions) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) throw new Error('Target element not found');
  createRoot(el).render(
    <StrictMode>
      <App graphqlHost={options.graphqlHost} graphqlToken={options.graphqlToken} />
    </StrictMode>
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
    });
  }
}

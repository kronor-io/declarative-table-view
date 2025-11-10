// Action types for custom view-level buttons rendered in the App menubar.
// These allow integrators to inject arbitrary buttons that can interact with
// the current view, filters, and trigger data refetches.
import type { View } from './view';
import type { FilterState } from './state';

// API object passed to each action handler giving controlled access to App internals.
export interface ActionAPI {
    view: View; // Currently selected view
    filterState: FilterState; // Current filter state map
    setFilterState: (next: FilterState) => void; // Replace filter state (resets pagination)
    refetch: () => void; // Trigger a data refetch for current view & filters
    showToast: (opts: { severity: 'info' | 'success' | 'warn' | 'error'; summary: string; detail?: string; life?: number }) => void; // Convenience toast helper
}

// Definition for a single action button.
export interface ActionDefinition {
    label: string; // Button label
    onClick: (api: ActionAPI) => void | Promise<void>; // Handler invoked on click
    icon?: string; // Optional PrimeReact icon class (e.g. 'pi pi-cog')
    outlined?: boolean; // Optional style control (defaults to true for consistency with existing buttons)
    size?: 'small' | 'normal'; // Optional size (defaults to 'small')
    disabled?: boolean; // Optional disabled state
}

// Action types for custom view-level buttons rendered in the App menubar.
// These allow integrators to inject arbitrary buttons that can interact with
// the current view, filters, and trigger data refetches.
import type { View } from './view';
import type { FilterState } from './state';
import { generateGraphQLQueryAST, renderGraphQLQuery } from './graphql';
import { buildGraphQLQueryVariables } from './data';
import type { PaginationState } from './state';
import type { ShowToastFn } from './toast';
import type { CSSProperties } from 'react';

// API object passed to each action handler giving controlled access to App internals.
export interface ActionAPI {
    view: View; // Currently selected view
    filterState: FilterState; // Current filter state map
    /** Current selected rows (simplified/flattened), empty when none selected or selection disabled. */
    selectedRows: unknown[];
    setFilterState: (next: FilterState) => void; // Replace filter state (resets pagination)
    refetch: () => void; // Trigger a data refetch for current view & filters
    showToast: ShowToastFn; // Convenience toast helper
    /** Current rows-per-page setting for pagination. */
    rowsPerPage: number;
    /** Build a GraphQLQueryAST for an arbitrary rootField (usually view.collectionName). */
    generateGraphQLQueryAST: typeof generateGraphQLQueryAST;
    /** Render a GraphQLQueryAST to a string. */
    renderGraphQLQuery: typeof renderGraphQLQuery;
    /** Build GraphQL variables (conditions, paginationCondition, orderBy, rowLimit) for the current view. */
    buildGraphQLQueryVariables: typeof buildGraphQLQueryVariables;
    /** Access current pagination state (page number and cursor history). */
    getPaginationState: () => PaginationState;
}

// Definition for a single action button.
export interface ActionDefinition {
    label: string; // Button label
    onClick: (api: ActionAPI) => void | Promise<void>; // Handler invoked on click
    icon?: string; // Optional PrimeReact icon class (e.g. 'pi pi-cog')
    /** Optional PrimeReact Button badge value. */
    badge?: string;
    /** Optional className applied to the badge element by PrimeReact Button. */
    badgeClassName?: string;
    /** Optional visual severity of the action button. */
    severity?: 'secondary' | 'success' | 'info' | 'warning' | 'help' | 'danger' | 'contrast';
    /** Optional className applied to the action button. */
    className?: string;
    /** Optional inline style applied to the action button. */
    style?: CSSProperties;
    outlined?: boolean; // Optional style control (defaults to true for consistency with existing buttons)
    size?: 'small' | 'normal'; // Optional size (defaults to 'small')
    disabled?: boolean; // Optional disabled state
}

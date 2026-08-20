// Action types for custom view-level buttons rendered in the App menubar.
// These allow integrators to inject arbitrary buttons that can interact with
// the current view, filters, and trigger data refetches.
import type { View } from './view';
import type { FilterState } from './state';
import type { DataOrdering } from './data-ordering';
import { generateGraphQLQueryAST, renderGraphQLQuery } from './graphql';
import { generateColumnAliasedGraphQLQueryAST } from './graphql/query';
import { buildGraphQLQueryVariables } from './data';
import type { PaginationState } from './state';
import type { ShowToastFn } from './toast';
import type { UserPreferences, ViewData } from './user-data';
import type { CSSProperties } from 'react';

export interface ActionUserDataAPI {
    preferences: UserPreferences;
    viewData: ViewData;
}

// API object passed to each action handler giving controlled access to App internals.
export interface ActionAPI {
    view: View; // Currently selected view
    filterState: FilterState; // Current *draft* filter state map (what the filter form edits)
    /** Current selected rows (simplified/flattened), empty when none selected or selection disabled. */
    selectedRows: unknown[];
    /**
     * Replace the *draft* filter state (resets pagination). This is what the
     * filter form edits; it does not affect the query until applied. Follow it
     * with `applyFilters` to make the new value take effect.
     */
    setFilterState: (next: FilterState) => void;
    /**
     * Refetch the current view using the *applied* filters, staying on the page
     * the user is on. Any pending draft changes made via `setFilterState` are
     * ignored — use `applyFilters` for those (which also returns to page one,
     * since a new filter invalidates the cursor history).
     */
    refetch: () => void;
    /**
     * Promote the current draft filter state to the applied state and refetch.
     * Use this after `setFilterState` to filter programmatically. Note that it
     * applies the whole draft, including edits the user has typed into an open
     * filter panel but not yet applied.
     */
    applyFilters: () => void;
    showToast: ShowToastFn; // Convenience toast helper with support for rich summary/detail nodes and custom content
    /** Current rows-per-page setting for pagination. */
    rowsPerPage: number;
    /**
     * The ordering the table is currently showing: the ordering the user picked by
     * sorting a column, or `null` when they have not sorted anything. `field` is the
     * GraphQL field path the column sorts by — dotted for nested columns, e.g.
     * `customer.profile.status` — not the column id.
     *
     * Pass it to `buildGraphQLQueryVariables` as its `ordering` argument to build
     * variables that order and paginate exactly like the table on screen. The view's
     * `staticOrdering` is applied either way — it trails this ordering as a
     * tie-breaker, and stands alone when this is `null`.
     */
    ordering: DataOrdering | null;
    /** Build a GraphQLQueryAST for an arbitrary rootField (usually the current view root field). */
    generateGraphQLQueryAST: typeof generateGraphQLQueryAST;
    /** Build a GraphQLQueryAST with top-level selections aliased to column ids. */
    generateColumnAliasedGraphQLQueryAST: typeof generateColumnAliasedGraphQLQueryAST;
    /** Render a GraphQLQueryAST to a string. */
    renderGraphQLQuery: typeof renderGraphQLQuery;
    /** Build GraphQL variables (conditions, paginationCondition, orderBy, rowLimit) for the current view. */
    buildGraphQLQueryVariables: typeof buildGraphQLQueryVariables;
    /** Access current pagination state (page number and cursor history). */
    getPaginationState: () => PaginationState;
    /** Access persisted user data for the current view. */
    userData: ActionUserDataAPI;
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

// Action types for custom view-level buttons rendered in the App menubar.
// These allow integrators to inject arbitrary buttons that can interact with
// the current view, filters, and trigger data refetches.
import type { View } from './view';
import type { FilterState } from './state';
import type { DataOrdering } from './data-ordering';
import { generateGraphQLQueryAST, renderGraphQLQuery } from './graphql';
import { generateColumnAliasedGraphQLQueryAST } from './graphql/query';
import { buildGraphQLQueryVariables, type PaginationCursor } from './data';
import type { ShowToastFn } from './toast';
import type { UserPreferences, ViewData } from './user-data';
import type { CSSProperties } from 'react';

export interface ActionUserDataAPI {
    preferences: UserPreferences;
    viewData: ViewData;
}

/**
 * The rows on screen, and the query they answer. A request for exactly these rows is built from
 * it alone: `buildGraphQLQueryVariables(view, filterState, rowsPerPage, cursors.at(-1) ?? null,
 * ordering)` for the variables, and `getViewStaticArgs(view)` for the document's arguments.
 */
export interface ShownRows {
    /**
     * The view as these rows were read: with the source, function arguments, static conditions
     * and static ordering they were asked for with, which the host may have changed since.
     */
    view: View;
    /** The filters these rows were asked for with: the applied ones, not the draft `ActionAPI.filterState`. */
    filterState: FilterState;
    /**
     * The ordering the user picked by sorting a column, or `null` when they have not sorted
     * anything. `field` is the GraphQL field path the column sorts by — dotted for nested
     * columns, e.g. `customer.profile.status` — not the column id. The view's `staticOrdering`
     * trails it as a tie-breaker, and stands alone when this is `null`.
     */
    ordering: DataOrdering | null;
    rowsPerPage: number;
    /**
     * Where each page up to this one starts: the last one is this page's cursor, and the length
     * is its page index, 0 for the first page.
     */
    cursors: NonNullable<PaginationCursor>[];
}

// API object passed to each action handler giving controlled access to App internals.
export interface ActionAPI {
    view: View; // Currently selected view
    filterState: FilterState; // Current *draft* filter state map (what the filter form edits)
    /** Current selected rows (simplified/flattened), empty when none selected or selection disabled. */
    selectedRows: unknown[];
    /**
     * Replace the *draft* filter state. This is what the filter form edits; it
     * does not affect the query, nor the page the user is on, until applied.
     * Follow it with `applyFilters` to make the new value take effect.
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
    /** The rows on screen and the query they answer; `null` until rows were shown. */
    shownRows: ShownRows | null;
    /** Build a GraphQLQueryAST for an arbitrary rootField (usually the current view root field). */
    generateGraphQLQueryAST: typeof generateGraphQLQueryAST;
    /**
     * Build a GraphQLQueryAST with top-level selections aliased to column ids. A column with
     * several top-level queries has no single selection to alias: the result is then a failure
     * naming those columns, and the caller narrows their `data` to the query it wants.
     */
    generateColumnAliasedGraphQLQueryAST: typeof generateColumnAliasedGraphQLQueryAST;
    /** Render a GraphQLQueryAST to a string. */
    renderGraphQLQuery: typeof renderGraphQLQuery;
    /** Build GraphQL variables (conditions, paginationCondition, orderBy, rowLimit) for the current view. */
    buildGraphQLQueryVariables: typeof buildGraphQLQueryVariables;
    /** Access persisted user data for the current view. */
    userData: ActionUserDataAPI;
}

// Definition for a single action button.
export interface ActionDefinition {
    label: string; // Button label
    /**
     * Identifies the action among the table's actions: `DTVAPI.runAction` finds it by it, and
     * analytics events name it. Unlike the label, it does not change with wording.
     */
    id: string;
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

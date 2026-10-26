import { encodeFilterState } from './filter-form-state';
import { decode, isRecord } from './decoder';
import { FilterState } from './state';
import { BASELINE_DEFINITION_REVISION, undecodedFilterState, type UndecodedFilterState } from './user-data-undecoded';
import { Result } from './result';
import { currentDefinitionRevision } from './view-migrations';
import type { View, ViewId } from './view';

/**
 * A filter state shared in a URL, with the view it is for and the revision of that view's
 * definition it was written for. Links from before views were named in them carry only
 * the state: `view` is `null` then.
 */
export type SharedFilterState = {
    view: ViewId | null;
    definitionRevision: number;
    state: UndecodedFilterState;
};

/**
 * Encode a view's filter state to a base64 URL-safe string
 */
/** What sharing needs of a view. */
export type SharedView = Pick<View, 'id' | 'filterGroups' | 'migrations'>;

export function encodeSharedFilterState(view: SharedView, filterState: FilterState): string {
    try {
        const shared = {
            view: view.id,
            rev: currentDefinitionRevision(view.migrations),
            state: encodeFilterState(filterState, view.filterGroups)
        };
        const jsonString = JSON.stringify(shared);
        // Convert to base64 and make it URL-safe
        return btoa(jsonString)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    } catch (error) {
        console.error('Failed to encode filter state:', error);
        throw new Error('Failed to encode filter state');
    }
}

function base64ToJson(encodedState: string): unknown {
    // Restore base64 padding and convert back from URL-safe
    const base64 = encodedState
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(encodedState.length + (4 - encodedState.length % 4) % 4, '=');

    return JSON.parse(atob(base64));
}

/**
 * Decode a filter state from a base64 URL-safe string. Throws when it is not one.
 */
export function decodeSharedFilterState(encodedState: string): SharedFilterState {
    let json: unknown;
    try {
        json = base64ToJson(encodedState);
    } catch (error) {
        console.error('Failed to decode filter state:', error);
        throw new Error('Failed to decode filter state');
    }

    // A bare filter state has filter ids for keys and filter states (objects) for values,
    // so it never has a string `view` and a numeric `rev`.
    const envelope = isRecord(json) && typeof json.view === 'string' && typeof json.rev === 'number'
        ? { view: json.view, definitionRevision: json.rev, state: json.state }
        : { view: null, definitionRevision: BASELINE_DEFINITION_REVISION, state: json };
    const { result } = decode(undecodedFilterState, envelope.state);
    if (Result.isFailure(result)) {
        throw new Error(`Failed to decode filter state: ${result.error.path}: ${result.error.message}`);
    }
    return { ...envelope, state: result.value };
}

/**
 * Create a shareable URL with the current filter state
 */
const FILTER_PARAM = 'dtv-filter-state';

export function createShareableUrl(view: SharedView, filterState: FilterState): string {
    try {
        const encodedFilter = encodeSharedFilterState(view, filterState);
        const url = new URL(window.location.href);
        url.searchParams.set(FILTER_PARAM, encodedFilter);
        return url.toString();
    } catch (error) {
        console.error('Failed to create shareable URL:', error);
        throw new Error('Failed to create shareable URL');
    }
}

export function setFilterInUrl(view: SharedView, filterState: FilterState): void {
    const url = new URL(window.location.href);
    url.searchParams.set(FILTER_PARAM, encodeSharedFilterState(view, filterState));
    window.history.replaceState({}, '', url);
}

/**
 * Copy URL to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        throw new Error('Failed to copy to clipboard');
    }
}

/**
 * Get filter state from URL parameters
 */
export function getFilterFromUrl(): SharedFilterState | null {
    try {
        const params = new URLSearchParams(window.location.search);
        const encodedFilter = params.get(FILTER_PARAM);
        if (!encodedFilter) return null;
        return decodeSharedFilterState(encodedFilter);
    } catch (error) {
        console.warn('Failed to parse filter from URL:', error);
        return null;
    }
}

/**
 * Remove filter parameter from URL without page reload
 */
export function clearFilterFromUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete(FILTER_PARAM);
    window.history.replaceState({}, '', url.toString());
}

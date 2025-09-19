import { serializeFilterFormStateMap } from './filter-form-state';
import { FilterState } from './state';

/**
 * Encode filter state to a base64 URL-safe string
 */
export function encodeFilterState(filterState: FilterState): string {
    try {
        const serializedState = serializeFilterFormStateMap(filterState);
        const jsonString = JSON.stringify(serializedState);
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

/**
 * Decode filter state from a base64 URL-safe string
 */
export function decodeFilterState(encodedState: string): any[] {
    try {
        // Restore base64 padding and convert back from URL-safe
        const base64 = encodedState
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(encodedState.length + (4 - encodedState.length % 4) % 4, '=');

        const jsonString = atob(base64);
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Failed to decode filter state:', error);
        throw new Error('Failed to decode filter state');
    }
}

/**
 * Create a shareable URL with the current filter state
 */
export function createShareableUrl(filterState: FilterState): string {
    try {
        const encodedFilter = encodeFilterState(filterState);
        const url = new URL(window.location.href);
        url.searchParams.set('dtv-shared-filter', encodedFilter);
        return url.toString();
    } catch (error) {
        console.error('Failed to create shareable URL:', error);
        throw new Error('Failed to create shareable URL');
    }
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
export function getFilterFromUrl(): any[] | null {
    try {
        const params = new URLSearchParams(window.location.search);
        const encodedFilter = params.get('dtv-shared-filter');

        if (!encodedFilter) {
            return null;
        }

        return decodeFilterState(encodedFilter);
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
    url.searchParams.delete('dtv-shared-filter');
    window.history.replaceState({}, '', url.toString());
}

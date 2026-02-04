import type { View } from '../framework/view';

export type { View };

/**
 * Identity helper for `View`.
 *
 * Keeps DSL call sites readable while we decide on a richer builder API.
 */
export function view(v: View): View {
    return v;
}

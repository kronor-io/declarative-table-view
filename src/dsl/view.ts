import type { View } from '../framework/view';
import { assertUniqueStringKeys } from './assertUniqueKeys';

export type { View };

/**
 * Identity helper for `View`.
 *
 * Keeps DSL call sites readable while we decide on a richer builder API.
 */
export function view(view: View): View {
    assertUniqueStringKeys(view.columnDefinitions, column => column.id, {
        context: `view("${view.id}") columnDefinitions`,
        keyName: 'id'
    });

    const allFilters = view.filterGroups.flatMap(group => group.filters);
    assertUniqueStringKeys(allFilters, filter => filter.id, {
        context: `view("${view.id}") filterGroups.filters`,
        keyName: 'id'
    });

    return view;
}

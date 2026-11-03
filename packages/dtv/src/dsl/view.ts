import type { ColumnDefinition } from '../framework/column-definition';
import type { View, SimplifiedRow } from '../framework/view';
import { assertUniqueStringKeys } from './assertUniqueKeys';

export type { View, SimplifiedRow };

/**
 * Identity helper for `View`.
 *
 * Keeps DSL call sites readable while we decide on a richer builder API. The view keeps the
 * types of its columns (the `[]` in the bound makes TypeScript infer a tuple instead of
 * merging them into one array element type), so `SimplifiedRow` can tell what its rows hold.
 */
export function view<Columns extends [] | ColumnDefinition[]>(view: View<Columns>): View<Columns> {
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

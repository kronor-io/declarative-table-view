import type { FieldQuery, DataFromFieldQueriesForRowSafe, FieldQueryForRowSafe } from '../framework/column-definition';
import type { RowExpansionDefinition, RowExpansionPredicate, RowExpansionRenderer } from '../framework/view';

/**
 * Creates a row expansion for a view over `Row`, like `column()`: its `data` is checked
 * against the row, and `render` and `canExpand` get that data typed from it. A lazy
 * expansion (`lazy: true`) fetches its data when the row is opened, so until `state` is
 * `'ready'` (and always in `canExpand`) its fields can be missing.
 */
export function rowExpansion<Row, const FieldQueries extends readonly FieldQuery[]>(args: {
    // Phantom type-only field used for inference; not included in the returned definition.
    rowType: Row;
    data: FieldQueries & readonly FieldQueryForRowSafe<Row>[];
    mode: 'single' | 'multiple';
    lazy?: false;
    render: RowExpansionRenderer<DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
    canExpand: RowExpansionPredicate<DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
}): RowExpansionDefinition<FieldQueries, DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
export function rowExpansion<Row, const FieldQueries extends readonly FieldQuery[]>(args: {
    rowType: Row;
    data: FieldQueries & readonly FieldQueryForRowSafe<Row>[];
    mode: 'single' | 'multiple';
    lazy: true;
    render: RowExpansionRenderer<DataFromFieldQueriesForRowSafe<Row, FieldQueries>, true>;
    canExpand: RowExpansionPredicate<DataFromFieldQueriesForRowSafe<Row, FieldQueries>, true>;
}): RowExpansionDefinition<FieldQueries, DataFromFieldQueriesForRowSafe<Row, FieldQueries>>;
export function rowExpansion(args: RowExpansionDefinition & { rowType: unknown }): RowExpansionDefinition {
    const base = { data: args.data, mode: args.mode };
    return args.lazy
        ? { ...base, lazy: true, render: args.render, canExpand: args.canExpand }
        : { ...base, render: args.render, canExpand: args.canExpand };
}

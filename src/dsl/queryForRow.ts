import type { QueryBuilder } from './internal/queryForRow';
import { queryForRow } from './internal/queryForRow';

// Public wrapper around the internal row-scoped query builder.
// It provides typed nested selection-set building via callbacks whenever scope changes.
export function queryForRowType<Row>(): QueryBuilder<Row>;
export function queryForRowType<Row>(_rowType: Row): QueryBuilder<Row>;
export function queryForRowType<Row>(_rowType?: Row): QueryBuilder<Row> {
    void _rowType;
    return queryForRow<Row>();
}

export type { QueryBuilder };

export default queryForRowType;

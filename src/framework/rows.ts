// Utilities for simplifying/flattening table rows
// A "row" from the <Table /> component is an array of cell objects.
// Each cell object can have multiple key/value pairs. We flatten a row
// by merging all cell objects left-to-right into a single plain object.
// Later keys overwrite earlier ones when duplicates occur.

export type RawRow = any[]; // Array of cell data objects
export type SimplifiedRow = Record<string, any>;

/**
 * Flatten a single raw row (array of cell objects) into one object.
 * Duplicate keys are overwritten by the last occurrence (right-most cell wins).
 */
export function simplifyRow(row: RawRow): SimplifiedRow {
    return row.reduce((acc: SimplifiedRow, cell: any) => {
        if (cell && typeof cell === 'object') {
            for (const [k, v] of Object.entries(cell)) {
                acc[k] = v;
            }
        }
        return acc;
    }, {} as SimplifiedRow);
}

/**
 * Flatten multiple raw rows.
 */
export function simplifyRows(rows: RawRow[]): SimplifiedRow[] {
    return rows.map(simplifyRow);
}

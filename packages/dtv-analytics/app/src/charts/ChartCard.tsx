import { useState, type ReactNode } from 'react';

export type TableView = {
    columns: string[];
    rows: Array<Array<string | number>>;
};

/**
 * A chart with its title, one line of what it shows, and the same numbers as a table: a value
 * the chart shows only on hover can be read without it.
 */
export function ChartCard({ title, note, table, children }: { title: string; note?: string; table: TableView; children: ReactNode }) {
    const [asTable, setAsTable] = useState(false);
    return (
        <figure className="chart-card">
            <figcaption>
                <span className="chart-title">{title}</span>
                <button type="button" className="link-button" onClick={() => setAsTable(!asTable)}>
                    {asTable ? 'Chart' : 'Table'}
                </button>
            </figcaption>
            {note !== undefined && <p className="chart-note">{note}</p>}
            {asTable ? (
                <div className="chart-table">
                    <table className="plain">
                        <thead><tr>{table.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                            {table.rows.map((row, i) => (
                                <tr key={i}>{row.map((cell, j) => <td key={j}>{typeof cell === 'number' ? cell.toLocaleString() : cell}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : children}
        </figure>
    );
}

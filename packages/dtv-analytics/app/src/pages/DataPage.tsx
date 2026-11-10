import { useState } from 'react';
import { Button } from 'primereact/button';
import { fetchUserData, waitForFetch, type FetchJob } from '../api';
import { useStoreQuery } from '../useStoreQuery';

type DataSummary = {
    coverage: Array<{ kind: string; ranges: string }>;
    fetchJob: Array<FetchJob & { createdAt: string; startedAt: string | null; finishedAt: string | null; period: string | null }>;
    eventTypeCount: Array<{ eventType: string; events: number; firstAt: string; lastAt: string }>;
    userDataAggregate: { aggregate: { count: number } };
    unreadableUserDataAggregate: { aggregate: { count: number } };
    definitionAggregate: { aggregate: { count: number } };
};

const DATA_SUMMARY = `query DataSummary {
    coverage { kind ranges }
    fetchJob(orderBy: { id: DESC }, limit: 50) { id kind state rows pages error createdAt startedAt finishedAt period }
    eventTypeCount(orderBy: { events: DESC }) { eventType events firstAt lastAt }
    userDataAggregate { aggregate { count } }
    unreadableUserDataAggregate { aggregate { count } }
    definitionAggregate { aggregate { count } }
}`;

/** A range or multirange of timestamps as Postgres writes it, in local time. */
function formatRanges(text: string | null): string {
    if (text === null || text === '{}') return 'nothing';
    const timestamps = [...text.matchAll(/"([^"]+)"/g)].map(m => new Date(m[1].replace(' ', 'T').replace(/\+00$/, 'Z')).toLocaleString());
    const pairs: string[] = [];
    for (let i = 0; i + 1 < timestamps.length; i += 2) pairs.push(`${timestamps[i]} – ${timestamps[i + 1]}`);
    return pairs.join(', ');
}

/** What the store holds and how it got it. */
export function DataPage({ store, connected, onFetched }: { store: string; connected: boolean; onFetched: () => void }) {
    const [refresh, setRefresh] = useState(0);
    const { data, error } = useStoreQuery<DataSummary>(store, DATA_SUMMARY, {}, refresh);
    const [job, setJob] = useState<FetchJob | null>(null);
    const running = job !== null && (job.state === 'queued' || job.state === 'running');

    if (error !== null) return <p className="error">{error}</p>;
    if (data === null) return null;

    const fetchAgain = async () => {
        const fetchId = await fetchUserData(0);
        await waitForFetch(store, fetchId, setJob);
        setRefresh(r => r + 1);
        onFetched();
    };

    return (
        <>
            <section className="panel">
                <h2>Events</h2>
                <p>
                    Fetched completely: {formatRanges(data.coverage.find(c => c.kind === 'events')?.ranges ?? null)}.
                    {' '}The host has {data.definitionAggregate.aggregate.count} definitions.
                </p>
                <table className="plain">
                    <thead><tr><th>Type</th><th>Events</th><th>First</th><th>Last</th></tr></thead>
                    <tbody>
                        {data.eventTypeCount.map(t => (
                            <tr key={t.eventType}>
                                <td>{t.eventType}</td>
                                <td>{t.events.toLocaleString()}</td>
                                <td>{new Date(t.firstAt).toLocaleString()}</td>
                                <td>{new Date(t.lastAt).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
            <section className="panel">
                <h2>User data</h2>
                <p>
                    {data.userDataAggregate.aggregate.count} revisions stored,
                    {' '}{data.unreadableUserDataAggregate.aggregate.count} that DTV cannot read.
                </p>
                <Button
                    label={running ? 'Fetching…' : 'Fetch user data again'}
                    disabled={!connected || running}
                    tooltip={connected ? undefined : 'Connect to the source first'}
                    tooltipOptions={{ showOnDisabled: true }}
                    onClick={() => { void fetchAgain(); }}
                />
            </section>
            <section className="panel">
                <h2>Fetches</h2>
                <table className="plain">
                    <thead><tr><th>#</th><th>Kind</th><th>Period</th><th>State</th><th>Rows</th><th>Pages</th><th>Took</th><th>Error</th></tr></thead>
                    <tbody>
                        {data.fetchJob.map(f => (
                            <tr key={f.id}>
                                <td>{f.id}</td>
                                <td>{f.kind}</td>
                                <td>{f.period === null ? '' : formatRanges(f.period)}</td>
                                <td>{f.state}</td>
                                <td>{f.rows.toLocaleString()}</td>
                                <td>{f.pages}</td>
                                <td>{f.startedAt !== null && f.finishedAt !== null ? `${((Date.parse(f.finishedAt) - Date.parse(f.startedAt)) / 1000).toFixed(1)} s` : ''}</td>
                                <td className="error">{f.error ?? ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </>
    );
}

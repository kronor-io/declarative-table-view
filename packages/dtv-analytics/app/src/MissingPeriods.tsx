import { useState } from 'react';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { fetchEvents, fetchUserData, waitForFetch, type FetchJob } from './api';
import { usePeriod } from './location';
import { useStoreQuery } from './useStoreQuery';

const MISSING_PERIODS = `query MissingPeriods($from: timestamptz!, $to: timestamptz!) {
    missingPeriods(args: { period_from: $from, period_to: $to }) { periodFrom periodTo }
    fetchJob(where: { kind: { _eq: "userData" }, state: { _eq: "done" } }, orderBy: { finishedAt: DESC }, limit: 1) { finishedAt }
}`;

/**
 * The server fetches the last minutes again each time: rows stored then may still appear behind
 * the rows read. A gap that recent is not shown as missing.
 */
const RECENT_MS = 15 * 60 * 1000;

/** User data older than this is fetched again, as the server does by default. */
const USER_DATA_MAX_AGE_MS = 60 * 60 * 1000;

/** The parts of the period not fetched yet, and user data not fetched lately, and the button that fetches them. */
export function MissingPeriods({ store, connected, refresh, onFetched }: {
    store: string;
    connected: boolean;
    refresh: number;
    onFetched: () => void;
}) {
    const period = usePeriod();
    // What is stored later than now does not exist yet. To the minute, so that the query's
    // variables stay the same between renders.
    const until = new Date(Math.min(period.to.getTime(), Math.floor(Date.now() / 60_000) * 60_000));
    const missing = useStoreQuery<{
        missingPeriods: Array<{ periodFrom: string; periodTo: string }>;
        fetchJob: Array<{ finishedAt: string }>;
    }>(
        store, MISSING_PERIODS, { from: period.from.toISOString(), to: until.toISOString() }, refresh,
    );
    const [job, setJob] = useState<FetchJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const parts = (missing.data?.missingPeriods ?? []).filter(p => Date.parse(p.periodFrom) < Date.now() - RECENT_MS);
    const userDataAt = missing.data?.fetchJob[0]?.finishedAt;
    const userDataStale = missing.data !== null && (userDataAt === undefined || Date.parse(userDataAt) < Date.now() - USER_DATA_MAX_AGE_MS);
    const running = job !== null && (job.state === 'queued' || job.state === 'running');

    if (parts.length === 0 && !userDataStale && !running && error === null) return null;

    const fetchMissing = async () => {
        setError(null);
        try {
            if (parts.length > 0) {
                const events = await waitForFetch(store, await fetchEvents(period.from, until), setJob);
                if (events.state === 'failed') {
                    setError(events.error);
                    onFetched();
                    return;
                }
            }
            // Nothing to do when it was fetched lately
            const userData = await waitForFetch(store, await fetchUserData(), setJob);
            if (userData.state === 'failed') setError(userData.error);
            onFetched();
        } catch (e) {
            setError(String(e));
        }
    };

    return (
        <div className="missing">
            {parts.length > 0 && (
                <span>
                    Not fetched: {parts.map(p => `${new Date(p.periodFrom).toLocaleString()} – ${new Date(p.periodTo).toLocaleString()}`).join(', ')}
                </span>
            )}
            {userDataStale && (
                <span>User data: {userDataAt === undefined ? 'never fetched' : `fetched ${new Date(userDataAt).toLocaleString()}`}</span>
            )}
            <Button
                label={running ? 'Fetching…' : 'Fetch'}
                disabled={!connected || running}
                tooltip={connected ? undefined : 'Connect to the source first'}
                tooltipOptions={{ showOnDisabled: true }}
                onClick={() => { void fetchMissing(); }}
            />
            {running && <ProgressBar mode="indeterminate" style={{ width: 160, height: 6 }} />}
            {running && <span>{job.rows.toLocaleString()} {job.kind === 'events' ? 'events' : 'users\' data'} in {job.pages} pages</span>}
            {error !== null && <span className="error">{error}</span>}
        </div>
    );
}

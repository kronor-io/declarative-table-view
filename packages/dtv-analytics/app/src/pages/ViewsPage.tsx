import { formatMs } from '../charts/theme';
import { DtvTable } from '../DtvTable';
import { navigate, usePeriod } from '../location';
import { Section, Tile } from '../scope';
import { useStoreQuery } from '../useStoreQuery';
import { definitionStatsView } from '../views/definitionStats';

type PeriodStats = {
    events: number;
    users: number;
    sessions: number;
    mounts: number;
    definitions: number;
    fetches: number;
    failedFetches: number;
    lostEvents: number;
    p95FetchMs: number | null;
};

const PERIOD_STATS = `query PeriodStats($from: timestamptz!, $to: timestamptz!, $impersonated: Boolean!) {
    periodStats(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated }) {
        events users sessions mounts definitions fetches failedFetches lostEvents p95FetchMs
    }
}`;

/** The period at a glance, and every definition with how it was used in it. */
export function ViewsPage({ store, refresh }: { store: string; refresh: number }) {
    const period = usePeriod();
    const stats = useStoreQuery<{ periodStats: PeriodStats[] }>(store, PERIOD_STATS, {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        impersonated: period.withImpersonated,
    }, refresh);
    const s = stats.data?.periodStats[0];

    return (
        <>
            {stats.error !== null && <p className="error">{stats.error}</p>}
            {s !== undefined && (
                <div className="tiles">
                    <Tile label="Definitions used" value={s.definitions} />
                    <Tile label="Mounts" value={s.mounts} />
                    <Tile label="Sessions" value={s.sessions} />
                    <Tile label="Users" value={s.users} />
                    <Tile label="Fetch p95" value={formatMs(s.p95FetchMs)} />
                    <Tile label="Failed fetches" value={`${s.failedFetches} of ${s.fetches.toLocaleString()}`} />
                    <Tile label="Lost events" value={`${s.lostEvents} of ${s.events.toLocaleString()}`} />
                </div>
            )}
            <Section title="Definitions">
                <DtvTable
                    store={store}
                    refresh={refresh}
                    view={p => definitionStatsView(p, definition => navigate(`/view/${encodeURIComponent(definition)}`))}
                />
            </Section>
        </>
    );
}

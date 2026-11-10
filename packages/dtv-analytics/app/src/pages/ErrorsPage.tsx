import { DailyCount } from '../charts/charts';
import { DtvTable } from '../DtvTable';
import { navigate, usePeriod } from '../location';
import { Section, TIME_ZONE, Tile } from '../scope';
import { useStoreQuery } from '../useStoreQuery';
import { ERROR_TYPES, errorGroupsView } from '../views/errorGroups';

type ErrorData = {
    errorGroups: Array<{ type: string; errors: number; users: number }>;
    errorsDaily: Array<{ day: string; count: number; users: number }>;
    periodStats: Array<{ events: number; lostEvents: number }>;
    unreadableUserDataAggregate: { aggregate: { count: number } };
    fetchJobAggregate: { aggregate: { count: number } };
};

const ERRORS = `query Errors($from: timestamptz!, $to: timestamptz!, $tz: String!, $impersonated: Boolean!) {
    errorGroups(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated }) { type errors users }
    errorsDaily(args: { period_from: $from, period_to: $to, time_zone: $tz, with_impersonated: $impersonated }) { day count users }
    periodStats(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated }) { events lostEvents }
    unreadableUserDataAggregate { aggregate { count } }
    fetchJobAggregate(where: { state: { _eq: "failed" } }) { aggregate { count } }
}`;

/** Everything that failed in the period, at a glance: what, where, how often, for how many. */
export function ErrorsPage({ store, refresh }: { store: string; refresh: number }) {
    const period = usePeriod();
    const { data, error } = useStoreQuery<ErrorData>(store, ERRORS, {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        tz: TIME_ZONE,
        impersonated: period.withImpersonated,
    }, refresh);

    // Errors per type, every type: none of a type is worth seeing too
    const byType = ERROR_TYPES.map(t => {
        const groups = data?.errorGroups.filter(g => g.type === t.value) ?? [];
        return { ...t, errors: groups.reduce((n, g) => n + g.errors, 0) };
    });
    const total = byType.reduce((n, t) => n + t.errors, 0);
    const stats = data?.periodStats[0];

    return (
        <>
            {error !== null && <p className="error">{error}</p>}
            {data !== null && (
                <>
                    <div className="tiles">
                        <Tile label="Errors" value={total} />
                        {byType.map(t => <Tile key={t.value} label={t.label} value={t.errors} />)}
                    </div>
                    <Section title="When">
                        <div className="chart-grid">
                            <DailyCount rows={data.errorsDaily} title="Errors" failure />
                        </div>
                    </Section>
                    <Section title="In the data">
                        <p className="chart-note">What went wrong on the way to the store, rather than for users.</p>
                        <div className="tiles">
                            <Tile label="Events lost on the way" value={`${stats?.lostEvents ?? 0} of ${(stats?.events ?? 0).toLocaleString()}`} />
                            <Tile label="User data DTV cannot read" value={data.unreadableUserDataAggregate.aggregate.count} />
                            <Tile label="Failed fetches from the source" value={data.fetchJobAggregate.aggregate.count} />
                        </div>
                    </Section>
                </>
            )}
            <Section title="Errors">
                <DtvTable store={store} refresh={refresh} view={p => errorGroupsView(p, definition => navigate(`/view/${encodeURIComponent(definition)}`))} />
            </Section>
        </>
    );
}

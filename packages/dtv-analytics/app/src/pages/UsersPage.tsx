import { DailyLine } from '../charts/charts';
import { DtvTable } from '../DtvTable';
import { navigate, usePeriod } from '../location';
import { Section, Tile, useScope } from '../scope';
import { userStatsView } from '../views/userStats';

/** The users of the period: how many came when, and how much each used the tables. */
export function UsersPage({ store, refresh }: { store: string; refresh: number }) {
    const period = usePeriod();
    const scope = useScope(store, period, { definition: null, userId: null }, refresh);
    const data = scope.data;
    const s = data?.periodStats[0];

    return (
        <>
            {scope.error !== null && <p className="error">{scope.error}</p>}
            {s !== undefined && (
                <div className="tiles">
                    <Tile label="Users" value={s.users} />
                    <Tile label="Sessions" value={s.sessions} />
                    <Tile label="Sessions per user" value={s.users === 0 ? '–' : (s.sessions / s.users).toFixed(1)} />
                    <Tile label="Mounts per user" value={s.users === 0 ? '–' : (s.mounts / s.users).toFixed(1)} />
                </div>
            )}
            {data !== null && (
                <Section title="Use">
                    <div className="chart-grid">
                        <DailyLine rows={data.activityDaily} measure="users" title="Active users" />
                        <DailyLine rows={data.activityDaily} measure="sessions" title="Sessions" />
                    </div>
                </Section>
            )}
            <Section title="Users">
                <DtvTable store={store} refresh={refresh} view={p => userStatsView(p, null, userId => navigate(`/user/${userId}`))} />
            </Section>
        </>
    );
}

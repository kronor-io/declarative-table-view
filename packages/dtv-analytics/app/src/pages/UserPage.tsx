import { BreakdownBars } from '../charts/charts';
import { DtvTable } from '../DtvTable';
import { navigate, usePeriod } from '../location';
import { AdoptionSection, InteractionCharts, PerformanceCharts, ScopeTiles, Section, kindOf, useScope } from '../scope';
import { useStoreQuery } from '../useStoreQuery';
import { savedFilterStatsView } from '../views/savedFilterStats';
import { userDefinitionStatsView } from '../views/userDefinitionStats';

type UserDetails = {
    appUserByPk: { name: string } | null;
    currentUserViewData: Array<{
        viewId: string;
        definition: string | null;
        definitionRevision: number;
        hiddenColumns: string[];
        columnOrder: string[] | null;
        rowsPerPage: number | null;
        ordering: { field: string; direction: string } | null;
        keepsFilters: boolean;
        keepsOrdering: boolean;
        keptFilters: string[];
    }>;
    currentUserData: Array<{ revision: string; updatedAt: string | null; fetchedAt: string }>;
};

const DETAILS = `query User($user: bigint!) {
    appUserByPk(id: $user) { name }
    currentUserViewData(where: { userId: { _eq: $user } }, orderBy: { viewId: ASC }) {
        viewId definition definitionRevision hiddenColumns columnOrder rowsPerPage ordering keepsFilters keepsOrdering keptFilters
    }
    currentUserData(where: { userId: { _eq: $user } }) { revision updatedAt fetchedAt }
}`;

/** One user: what they used in the period, what failed for them, and what they keep. */
export function UserPage({ store, userId, refresh }: { store: string; userId: string; refresh: number }) {
    const period = usePeriod();
    const scope = useScope(store, period, { definition: null, userId }, refresh);
    const details = useStoreQuery<UserDetails>(store, DETAILS, { user: userId }, refresh);
    const data = scope.data;
    const d = details.data;
    const stored = d?.currentUserData[0];

    return (
        <>
            <div className="page-title">
                <a href="/users" onClick={e => { e.preventDefault(); navigate('/users'); }}>Users</a>
                <h2>{d?.appUserByPk?.name ?? `User ${userId}`}</h2>
            </div>
            {scope.error !== null && <p className="error">{scope.error}</p>}
            {data !== null && <ScopeTiles data={data} perUser />}
            <Section title="Definitions used">
                <DtvTable
                    store={store}
                    refresh={refresh}
                    view={p => userDefinitionStatsView(userId, p, definition => navigate(`/view/${encodeURIComponent(definition)}`))}
                    deps={[userId]}
                />
            </Section>
            {data !== null && <AdoptionSection data={data} perUser />}
            {data !== null && (
                <Section title="Filters and settings">
                    <InteractionCharts data={data} />
                </Section>
            )}
            {data !== null && (
                <Section title="Speed and failures">
                    <PerformanceCharts data={data} />
                    <div className="chart-grid">
                        <BreakdownBars rows={kindOf(data, 'eventType')} title="Events by type" unit="events" />
                    </div>
                </Section>
            )}
            <Section title="Saved filters">
                <p className="chart-note">The saved filters in their latest user data, as last fetched, with how often they applied each in the period.</p>
                <DtvTable
                    store={store}
                    refresh={refresh}
                    view={p => savedFilterStatsView(p, {
                        user: id => navigate(`/user/${id}`),
                        definition: definition => navigate(`/view/${encodeURIComponent(definition)}`),
                    }, userId)}
                    deps={[userId]}
                />
            </Section>
            <Section title="What they keep">
                {d !== null && stored === undefined && <p className="muted">No user data fetched for this user.</p>}
                {stored !== undefined && (
                    <p className="chart-note">
                        Revision {stored.revision} of their user data
                        {stored.updatedAt !== null ? `, changed ${new Date(stored.updatedAt).toLocaleString()}` : ''}
                        , fetched {new Date(stored.fetchedAt).toLocaleString()}
                    </p>
                )}
                {d !== null && d.currentUserViewData.length > 0 && (
                    <div className="chart-table">
                        <table className="plain">
                            <thead>
                                <tr><th>View</th><th>Kept filters</th><th>Hidden columns</th><th>Sorting</th><th>Rows per page</th></tr>
                            </thead>
                            <tbody>
                                {d.currentUserViewData.map(v => (
                                    <tr key={v.viewId}>
                                        <td>
                                            {v.definition === null ? `${v.viewId} (unknown)` : (
                                                <a href={`/view/${encodeURIComponent(v.definition)}`} onClick={e => { e.preventDefault(); navigate(`/view/${encodeURIComponent(v.definition ?? '')}`); }}>
                                                    {v.viewId}
                                                </a>
                                            )}
                                        </td>
                                        <td>{v.keepsFilters ? v.keptFilters.join(', ') : 'not kept'}</td>
                                        <td>{v.hiddenColumns.join(', ')}</td>
                                        <td>{v.ordering === null ? '' : `${v.ordering.field} ${v.ordering.direction}`}{v.keepsOrdering ? '' : ' (not kept)'}</td>
                                        <td>{v.rowsPerPage ?? ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>
        </>
    );
}

import { FilterUsage, type FilterUse } from '../charts/charts';
import { formatMs } from '../charts/theme';
import { DtvTable } from '../DtvTable';
import { navigate, usePeriod } from '../location';
import { AdoptionSection, InteractionCharts, PerformanceCharts, ScopeTiles, Section, kindOf, useScope } from '../scope';
import { useStoreQuery } from '../useStoreQuery';
import { filterStatsView } from '../views/filterStats';
import { userStatsView } from '../views/userStats';

type DefinitionDetails = {
    definitionByPk: { revision: number } | null;
    columnStats: Array<{ columnId: string; hiddenBy: number; usersWithData: number; inDefinition: boolean }>;
    slowFilterSets: Array<{ filters: string; fetches: number; failedFetches: number; p50Ms: number | null; p95Ms: number | null }>;
    filterStats: FilterUse[];
};

const DETAILS = `query Definition($definition: String!, $from: timestamptz!, $to: timestamptz!, $impersonated: Boolean!) {
    definitionByPk(name: $definition) { revision }
    columnStats(args: { p_definition: $definition }, orderBy: { hiddenBy: DESC }) { columnId hiddenBy usersWithData inDefinition }
    slowFilterSets(
        args: { p_definition: $definition, period_from: $from, period_to: $to, with_impersonated: $impersonated },
        where: { fetches: { _gte: 3 } }, orderBy: { p95Ms: DESC_NULLS_LAST }, limit: 15
    ) { filters fetches failedFetches p50Ms p95Ms }
    filterStats(args: { p_definition: $definition, period_from: $from, period_to: $to, with_impersonated: $impersonated }) {
        filterId applications users keptBy inSavedFilters removed inDefinition
    }
}`;

/** One definition: how it was used in the period, its filters and columns, how fast, and who used it. */
export function ViewPage({ store, definition, refresh }: { store: string; definition: string; refresh: number }) {
    const period = usePeriod();
    const scope = useScope(store, period, { definition, userId: null }, refresh);
    const details = useStoreQuery<DefinitionDetails>(store, DETAILS, {
        definition,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        impersonated: period.withImpersonated,
    }, refresh);
    const data = scope.data;
    const d = details.data;

    return (
        <>
            <div className="page-title">
                <a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>Views</a>
                <h2>{definition}</h2>
                {d !== null && <span className="muted">{d.definitionByPk === null ? 'Not a definition the host has' : `revision ${d.definitionByPk.revision}`}</span>}
            </div>
            {scope.error !== null && <p className="error">{scope.error}</p>}
            {data !== null && <ScopeTiles data={data} perUser={false} />}
            {data !== null && <AdoptionSection data={data} perUser={false} />}
            <Section title="Filters and settings">
                {d !== null && data !== null && (
                    <FilterUsage
                        filters={d.filterStats}
                        applications={data.periodStats[0]?.filtersApplied ?? 0}
                        triggers={kindOf(data, 'trigger')}
                        panelOpens={kindOf(data, 'panel').find(p => p.key === 'filters')?.count ?? 0}
                    />
                )}
                <DtvTable store={store} refresh={refresh} view={p => filterStatsView(definition, p)} deps={[definition]} />
                {data !== null && <InteractionCharts data={data} />}
                {d !== null && d.columnStats.length > 0 && <HiddenColumns columns={d.columnStats} />}
            </Section>
            <Section title="Speed and failures">
                {data !== null && <PerformanceCharts data={data} />}
                {d !== null && (
                    <figure className="chart-card">
                        <figcaption><span className="chart-title">Filters of the slowest requests</span></figcaption>
                        <p className="chart-note">The filters requests were made with, slowest p95 first, those with 3 requests or more</p>
                        <div className="chart-table">
                            <table className="plain">
                                <thead><tr><th>Filters</th><th>Requests</th><th>Failed</th><th>Median</th><th>p95</th></tr></thead>
                                <tbody>
                                    {d.slowFilterSets.map(s => (
                                        <tr key={s.filters}>
                                            <td>{s.filters}</td>
                                            <td>{s.fetches}</td>
                                            <td>{s.failedFetches}</td>
                                            <td>{formatMs(s.p50Ms)}</td>
                                            <td>{formatMs(s.p95Ms)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </figure>
                )}
            </Section>
            <Section title="Users">
                <DtvTable store={store} refresh={refresh} view={p => userStatsView(p, definition, userId => navigate(`/user/${userId}`))} deps={[definition]} />
            </Section>
        </>
    );
}

/** The columns users hide, in their latest data; one line when nobody hides any. */
function HiddenColumns({ columns }: { columns: DefinitionDetails['columnStats'] }) {
    const users = columns[0]?.usersWithData ?? 0;
    const hidden = columns.filter(c => c.hiddenBy > 0);
    if (hidden.length === 0) {
        return (
            <p className="chart-note">
                {users === 0 ? 'No user has stored data for this definition.' : `None of the ${users} users with data for this definition hides a column.`}
            </p>
        );
    }
    return (
        <figure className="chart-card">
            <figcaption><span className="chart-title">Hidden columns</span></figcaption>
            <p className="chart-note">
                In users' latest data, of the {users} users who have data for this definition.
                {' '}{columns.length - hidden.length} columns nobody hides.
            </p>
            <div className="chart-table">
                <table className="plain">
                    <thead><tr><th>Column</th><th>Hidden by</th><th>In the definition</th></tr></thead>
                    <tbody>
                        {hidden.map(c => (
                            <tr key={c.columnId}><td>{c.columnId}</td><td>{c.hiddenBy}</td><td>{c.inDefinition ? 'yes' : 'no, removed'}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </figure>
    );
}

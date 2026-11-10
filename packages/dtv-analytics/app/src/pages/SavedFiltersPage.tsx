import { BreakdownBars, type BreakdownRow } from '../charts/charts';
import { DtvTable } from '../DtvTable';
import { navigate, usePeriod } from '../location';
import { Section, Tile } from '../scope';
import { useStoreQuery } from '../useStoreQuery';
import { savedFilterStatsView } from '../views/savedFilterStats';

type SavedFilterData = {
    savedFilterSummary: Array<{
        savedFilters: number;
        users: number;
        definitions: number;
        applications: number;
        applied: number;
        created: number;
        overwritten: number;
        deleted: number;
    }>;
    savedFilterBreakdown: Array<BreakdownRow & { kind: string }>;
};

const SAVED_FILTERS = `query SavedFilters($from: timestamptz!, $to: timestamptz!, $impersonated: Boolean!) {
    savedFilterSummary(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated }) {
        savedFilters users definitions applications applied created overwritten deleted
    }
    savedFilterBreakdown(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated }) {
        kind key count users
    }
}`;

/** The saved filters users keep: where, what they set, and which are used. */
export function SavedFiltersPage({ store, refresh }: { store: string; refresh: number }) {
    const period = usePeriod();
    const { data, error } = useStoreQuery<SavedFilterData>(store, SAVED_FILTERS, {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        impersonated: period.withImpersonated,
    }, refresh);
    const s = data?.savedFilterSummary[0];
    const kind = (k: string) => data?.savedFilterBreakdown.filter(r => r.kind === k) ?? [];

    return (
        <>
            {error !== null && <p className="error">{error}</p>}
            <p className="chart-note">What users keep is their latest user data, as last fetched; what they did with it, the period's events.</p>
            {s !== undefined && (
                <div className="tiles">
                    <Tile label="Saved filters" value={s.savedFilters} />
                    <Tile label="Users with saved filters" value={s.users} />
                    <Tile label="Definitions with saved filters" value={s.definitions} />
                    <Tile label="Applied in the period" value={`${s.applied} of ${s.savedFilters}`} />
                    <Tile label="Applications" value={s.applications} />
                    <Tile label="Created / overwritten / deleted" value={`${s.created} / ${s.overwritten} / ${s.deleted}`} />
                </div>
            )}
            {data !== null && (
                <Section title="What they are">
                    <div className="chart-grid">
                        <BreakdownBars rows={kind('definition')} title="Saved filters per definition" unit="saved filters" />
                        <BreakdownBars rows={kind('applied')} title="Applications per definition" note="Applications of saved filters in the period" unit="applications" />
                        <BreakdownBars rows={kind('filter')} title="Filters they set" note="How many saved filters set each filter" unit="saved filters" />
                        <BreakdownBars rows={kind('filterCount')} title="Filters per saved filter" unit="saved filters" />
                    </div>
                </Section>
            )}
            <Section title="Saved filters">
                <DtvTable
                    store={store}
                    refresh={refresh}
                    view={p => savedFilterStatsView(p, {
                        user: userId => navigate(`/user/${userId}`),
                        definition: definition => navigate(`/view/${encodeURIComponent(definition)}`),
                    })}
                />
            </Section>
        </>
    );
}

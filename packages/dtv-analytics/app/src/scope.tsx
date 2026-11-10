import { Fragment, type ReactNode } from 'react';
import { BreakdownBars, DailyLine, DurationBoxes, type BreakdownRow, type DailyRow, type DurationRow } from './charts/charts';
import { formatMs } from './charts/theme';
import type { Period } from './location';
import { useStoreQuery } from './useStoreQuery';

/*
 * What the view and user pages share: the numbers of a scope, the events of the period of
 * one definition or one user, and how they are shown.
 */

export type Scope = { definition: string | null; userId: string | null };

type ScopeData = {
    periodStats: Array<{
        events: number;
        users: number;
        sessions: number;
        mounts: number;
        definitions: number;
        filtersApplied: number;
        fetches: number;
        failedFetches: number;
        lostEvents: number;
        p95FetchMs: number | null;
        medianTimeOnViewMs: number | null;
    }>;
    activityDaily: DailyRow[];
    breakdown: Array<BreakdownRow & { kind: string }>;
    fetchDurations: DurationRow[];
};

const SCOPE_QUERY = `query Scope($from: timestamptz!, $to: timestamptz!, $tz: String!, $impersonated: Boolean!, $definition: String, $user: bigint) {
    periodStats(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated, p_definition: $definition, p_user_id: $user }) {
        events users sessions mounts definitions filtersApplied fetches failedFetches lostEvents p95FetchMs medianTimeOnViewMs
    }
    activityDaily(args: { period_from: $from, period_to: $to, time_zone: $tz, with_impersonated: $impersonated, p_definition: $definition, p_user_id: $user }) {
        day users sessions mounts fetches failedFetches p50FetchMs p95FetchMs
    }
    breakdown(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated, p_definition: $definition, p_user_id: $user }) {
        kind key count users
    }
    fetchDurations(args: { period_from: $from, period_to: $to, with_impersonated: $impersonated, p_definition: $definition, p_user_id: $user }) {
        reason fetches minMs p25Ms p50Ms p75Ms p95Ms
    }
}`;

export const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useScope(store: string, period: Period, scope: Scope, refresh: number) {
    return useStoreQuery<ScopeData>(store, SCOPE_QUERY, {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        tz: TIME_ZONE,
        impersonated: period.withImpersonated,
        definition: scope.definition,
        user: scope.userId,
    }, refresh);
}

export const kindOf = (data: ScopeData, kind: string): BreakdownRow[] => data.breakdown.filter(r => r.kind === kind);

/**
 * A chart that has something to show, or the words for what did not happen (`''` when another
 * part already says it).
 */
type Part = { chart: ReactNode; empty: boolean; nothing: string };

const breakdown = (data: ScopeData, kind: string, title: string, nothing: string, options: { note?: string; unit?: string; failure?: boolean } = {}): Part => {
    const rows = kindOf(data, kind);
    return { chart: <BreakdownBars rows={rows} title={title} {...options} />, empty: rows.length === 0, nothing };
};

/** The charts with something to show, and one line for the rest. */
function Charts({ parts }: { parts: Part[] }) {
    const shown = parts.filter(p => !p.empty);
    const nothing = parts.filter(p => p.empty && p.nothing !== '').map(p => p.nothing);
    return (
        <>
            {shown.length > 0 && <div className="chart-grid">{shown.map((p, i) => <Fragment key={i}>{p.chart}</Fragment>)}</div>}
            {nothing.length > 0 && <p className="chart-note">In this period: {nothing.join(', ')}.</p>}
        </>
    );
}

export function Tile({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="tile">
            <div className="label">{label}</div>
            <div className="value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
    );
}

export function ScopeTiles({ data, perUser }: { data: ScopeData; perUser: boolean }) {
    const s = data.periodStats[0];
    if (s === undefined) return null;
    return (
        <div className="tiles">
            {!perUser && <Tile label="Users" value={s.users} />}
            <Tile label="Sessions" value={s.sessions} />
            <Tile label="Mounts" value={s.mounts} />
            {perUser && <Tile label="Definitions used" value={s.definitions} />}
            <Tile label="Median time on view" value={formatMs(s.medianTimeOnViewMs)} />
            <Tile label="Filters applied" value={s.filtersApplied} />
            <Tile label="Fetch p95" value={formatMs(s.p95FetchMs)} />
            <Tile label="Failed fetches" value={`${s.failedFetches} of ${s.fetches.toLocaleString()}`} />
            <Tile label="Lost events" value={`${s.lostEvents} of ${s.events.toLocaleString()}`} />
        </div>
    );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="panel">
            <h2>{title}</h2>
            {children}
        </section>
    );
}

/** When the scope was used, and how its tables open. */
export function AdoptionSection({ data, perUser }: { data: ScopeData; perUser: boolean }) {
    return (
        <Section title="Use">
            <div className="chart-grid">
                {!perUser && <DailyLine rows={data.activityDaily} measure="users" title="Active users" />}
                <DailyLine rows={data.activityDaily} measure="mounts" title="Mounts" />
                <DailyLine rows={data.activityDaily} measure="sessions" title="Sessions" />
            </div>
            <Charts parts={[
                breakdown(data, 'linkSource', 'Opened by links from', 'no links opened', { unit: 'links' }),
                breakdown(data, 'previousView', 'Switched to from the views menu', 'no switches in the views menu', { unit: 'switches' }),
                breakdown(data, 'dtvVersion', 'DTV versions', 'no sessions started', { unit: 'sessions' }),
                breakdown(data, 'appVersion', 'App versions', 'no app versions reported', { unit: 'sessions' }),
            ]} />
        </Section>
    );
}

/** How filters, sorting and the table's panels are used. */
export function InteractionCharts({ data }: { data: ScopeData }) {
    return (
        <Charts parts={[
            breakdown(data, 'trigger', 'How filters are applied', 'no filters applied'),
            breakdown(data, 'ordering', 'Sorted by', 'no sorting'),
            breakdown(data, 'rowsPerPage', 'Rows per page picked', 'no rows per page picked'),
            breakdown(data, 'panel', 'Panels opened', 'no panels opened'),
            breakdown(data, 'action', 'Actions', 'no actions', { note: 'By action, and how it ended' }),
            breakdown(data, 'filterSearch', 'Searched for among the filters', 'no searches among the filters', { unit: 'searches' }),
            breakdown(data, 'aiPrompt', 'Asked of the AI assistant', 'no AI prompts', { unit: 'prompts' }),
        ]} />
    );
}

/** How fast requests are, and what fails. */
export function PerformanceCharts({ data }: { data: ScopeData }) {
    const failed = data.activityDaily.some(d => d.failedFetches > 0);
    return (
        <Charts parts={[
            { chart: <DailyLine rows={data.activityDaily} measure="p95FetchMs" title="Fetch p95" />, empty: data.fetchDurations.length === 0, nothing: 'no successful requests' },
            { chart: <DailyLine rows={data.activityDaily} measure="failedFetches" title="Failed fetches" failure />, empty: !failed, nothing: 'no failed requests' },
            { chart: <DurationBoxes rows={data.fetchDurations} />, empty: data.fetchDurations.length === 0, nothing: '' },
            breakdown(data, 'fetchError', 'Why requests failed', '', { unit: 'failures', failure: true }),
            breakdown(data, 'problem', 'User data problems', 'no user data problems', { note: 'Failed saves, conflicts, read-only data, failed suggestions', failure: true }),
            breakdown(data, 'fetchReason', 'Why rows were requested', 'no requests', { unit: 'requests' }),
        ]} />
    );
}

import { useMemo } from 'react';
import { ChartCard } from './ChartCard';
import { EChart, type ChartOption } from './EChart';
import { AXIS, CRITICAL, GRID, SERIES, SURFACE, axisLabel, formatMs, tooltip } from './theme';

/*
 * The app's chart forms. Each takes rows as the store returns them and shows one measure: two
 * measures are two charts, never two axes.
 */

export type DailyRow = {
    day: string;
    users: number;
    sessions: number;
    mounts: number;
    fetches: number;
    failedFetches: number;
    p50FetchMs: number | null;
    p95FetchMs: number | null;
};

type DailyMeasure = 'users' | 'sessions' | 'mounts' | 'fetches' | 'failedFetches' | 'p95FetchMs';

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** One measure a day, as a line: a gap in a duration is a day without requests. */
export function DailyLine({ rows, measure, title, failure = false }: { rows: DailyRow[]; measure: DailyMeasure; title: string; failure?: boolean }) {
    return (
        <DaySeries
            days={rows.map(r => r.day)}
            values={rows.map(r => r[measure])}
            title={title}
            duration={measure === 'p95FetchMs'}
            failure={failure}
        />
    );
}

/** A count a day, as a line. */
export function DailyCount({ rows, title, failure = false }: { rows: Array<{ day: string; count: number }>; title: string; failure?: boolean }) {
    return <DaySeries days={rows.map(r => r.day)} values={rows.map(r => r.count)} title={title} duration={false} failure={failure} />;
}

function DaySeries({ days, values, title, duration, failure }: {
    days: string[];
    values: Array<number | null>;
    title: string;
    /** The values are milliseconds. */
    duration: boolean;
    failure: boolean;
}) {
    const color = failure ? CRITICAL : SERIES;
    const option = useMemo((): ChartOption => ({
        grid: { left: 48, right: 16, top: 12, bottom: 28 },
        tooltip: {
            ...tooltip,
            trigger: 'axis',
            axisPointer: { type: 'line', lineStyle: { color: AXIS } },
            valueFormatter: (value: number | null) => duration ? formatMs(value) : (value ?? 0).toLocaleString(),
        },
        xAxis: {
            type: 'category',
            data: days.map(dayLabel),
            axisLine: { lineStyle: { color: AXIS } },
            axisTick: { show: false },
            axisLabel,
        },
        yAxis: {
            type: 'value',
            minInterval: duration ? undefined : 1,
            splitLine: { lineStyle: { color: GRID } },
            axisLabel: { ...axisLabel, formatter: (value: number) => duration ? formatMs(value) : value.toLocaleString() },
        },
        series: [{
            name: title,
            type: 'line',
            data: values,
            connectNulls: false,
            lineStyle: { width: 2, color },
            itemStyle: { color, borderColor: SURFACE, borderWidth: 2 },
            symbolSize: 8,
            showSymbol: days.length <= 14,
        }],
    }), [days, values, title, duration, color]);

    return (
        <ChartCard
            title={title}
            table={{ columns: ['Day', title], rows: days.map((day, i) => [day, duration ? formatMs(values[i]) : values[i] ?? 0]) }}
        >
            <EChart option={option} height={180} label={`${title}, a day`} />
        </ChartCard>
    );
}

export type BreakdownRow = { key: string; count: number; users: number };

/** Counts by key as horizontal bars, the first ten in their order; the table has the rest. */
export function BreakdownBars({ rows, title, note, unit = 'times', failure = false }: {
    rows: BreakdownRow[];
    title: string;
    note?: string;
    unit?: string;
    failure?: boolean;
}) {
    // A bar of all the rest would be longer than the bars it follows, and read as one more key
    const shown = useMemo(() => rows.slice(0, 10), [rows]);
    const more = rows.length - shown.length;
    const color = failure ? CRITICAL : SERIES;
    const option = useMemo((): ChartOption => ({
        grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
        tooltip: {
            ...tooltip,
            trigger: 'item',
            formatter: (p: { dataIndex: number }) => {
                const row = shown[p.dataIndex];
                return row === undefined ? '' : `<b>${row.count.toLocaleString()}</b> ${unit}${row.users > 0 ? `, ${row.users} users` : ''}<br/>${escapeHtml(row.key)}`;
            },
        },
        xAxis: { type: 'value', show: false },
        yAxis: {
            type: 'category',
            data: shown.map(r => r.key),
            inverse: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { ...axisLabel, width: 220, overflow: 'truncate' },
        },
        series: [{
            type: 'bar',
            data: shown.map(r => r.count),
            barMaxWidth: 16,
            itemStyle: { color, borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: 'right', color: '#52514e', fontSize: 11, formatter: (p: { value: number }) => p.value.toLocaleString() },
        }],
    }), [shown, color, unit]);

    if (rows.length === 0) {
        return <ChartCard title={title} note={note} table={{ columns: [], rows: [] }}><p className="chart-empty">None in this period.</p></ChartCard>;
    }
    return (
        <ChartCard title={title} note={note} table={{ columns: ['', unit, 'Users'], rows: rows.map(r => [r.key, r.count, r.users]) }}>
            <EChart option={option} height={Math.max(80, shown.length * 26 + 8)} label={title} />
            {more > 0 && <p className="chart-note">{more} more in the table</p>}
        </ChartCard>
    );
}

export type DurationRow = {
    reason: string;
    fetches: number;
    minMs: number | null;
    p25Ms: number | null;
    p50Ms: number | null;
    p75Ms: number | null;
    p95Ms: number | null;
};

/** How long successful requests took, by why they were made: whiskers at the minimum and p95. */
export function DurationBoxes({ rows }: { rows: DurationRow[] }) {
    const option = useMemo((): ChartOption => ({
        grid: { left: 8, right: 24, top: 8, bottom: 28, containLabel: true },
        tooltip: {
            ...tooltip,
            trigger: 'item',
            formatter: (p: { dataIndex: number }) => {
                const r = rows[p.dataIndex];
                return r === undefined ? '' : [
                    `<b>${escapeHtml(r.reason)}</b>, ${r.fetches.toLocaleString()} requests`,
                    `p95 ${formatMs(r.p95Ms)}`,
                    `p75 ${formatMs(r.p75Ms)}`,
                    `median ${formatMs(r.p50Ms)}`,
                    `p25 ${formatMs(r.p25Ms)}`,
                    `fastest ${formatMs(r.minMs)}`,
                ].join('<br/>');
            },
        },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: GRID } }, axisLabel: { ...axisLabel, formatter: (v: number) => formatMs(v) } },
        yAxis: { type: 'category', data: rows.map(r => r.reason), inverse: true, axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false }, axisLabel },
        series: [{
            type: 'boxplot',
            data: rows.map(r => [r.minMs, r.p25Ms, r.p50Ms, r.p75Ms, r.p95Ms]),
            boxWidth: [8, 16],
            itemStyle: { color: '#cde2fb', borderColor: SERIES, borderWidth: 2 },
        }],
    }), [rows]);

    return (
        <ChartCard
            title="How long requests take"
            note="Successful requests by why they were made: box from p25 to p75, line at the median, whiskers at the fastest and p95"
            table={{
                columns: ['Reason', 'Requests', 'Median', 'p75', 'p95'],
                rows: rows.map(r => [r.reason, r.fetches, formatMs(r.p50Ms), formatMs(r.p75Ms), formatMs(r.p95Ms)]),
            }}
        >
            <EChart option={option} height={Math.max(100, rows.length * 36 + 40)} label="Request durations by reason" />
        </ChartCard>
    );
}

/** Why the chart has no bars: what the applications were, and whether anyone looked at the filters. */
function noFilterSet(applications: number, triggers: BreakdownRow[], panelOpens: number): string {
    if (applications === 0) return 'No filters were applied in this period.';
    const how = triggers.map(t => `${t.key} ${t.count.toLocaleString()}`).join(', ');
    const all = applications === 1 ? 'The 1 application set no filter' : `All ${applications.toLocaleString()} applications set no filter`;
    const panel = panelOpens === 0
        ? 'and the filter panel was never opened'
        : `though the filter panel was opened ${panelOpens.toLocaleString()} ${panelOpens === 1 ? 'time' : 'times'}`;
    return `${all} (${how}), ${panel}.`;
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export type FilterUse = {
    filterId: string;
    applications: number;
    users: number;
    keptBy: number;
    inSavedFilters: number;
    removed: boolean;
    inDefinition: boolean;
};

/**
 * The filters a definition's applications set, most used first, as a share of all its
 * applications; and its current filters nobody set, listed under them. When no application set
 * one, what the applications were: a table used without filters, e.g. on a record's page.
 */
export function FilterUsage({ filters, applications, triggers, panelOpens }: {
    filters: FilterUse[];
    applications: number;
    /** The applications by what applied them. */
    triggers: BreakdownRow[];
    /** How often the filter panel was opened. */
    panelOpens: number;
}) {
    const used = useMemo(() => filters.filter(f => f.applications > 0).sort((a, b) => b.applications - a.applications), [filters]);
    const unused = useMemo(() => filters.filter(f => f.applications === 0 && f.inDefinition).sort((a, b) => a.filterId.localeCompare(b.filterId)), [filters]);
    const label = (f: FilterUse) => f.removed || !f.inDefinition ? `${f.filterId} (removed)` : f.filterId;
    const share = (n: number) => {
        if (applications === 0) return '';
        const percent = (n / applications) * 100;
        return n > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
    };
    const option = useMemo((): ChartOption => ({
        grid: { left: 8, right: 88, top: 4, bottom: 4, containLabel: true },
        tooltip: {
            ...tooltip,
            trigger: 'item',
            formatter: (p: { dataIndex: number }) => {
                const f = used[p.dataIndex];
                return f === undefined ? '' : [
                    `<b>${f.applications.toLocaleString()}</b> of ${applications.toLocaleString()} applications (${share(f.applications)}), ${f.users} users`,
                    escapeHtml(label(f)),
                    `kept between visits by ${f.keptBy}, in ${f.inSavedFilters} saved filters`,
                ].join('<br/>');
            },
        },
        xAxis: { type: 'value', show: false, max: Math.max(1, ...used.map(f => f.applications)) },
        yAxis: {
            type: 'category',
            data: used.map(label),
            inverse: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { ...axisLabel, width: 220, overflow: 'truncate' },
        },
        series: [{
            type: 'bar',
            data: used.map(f => f.applications),
            barMaxWidth: 16,
            itemStyle: { color: SERIES, borderRadius: [0, 4, 4, 0] },
            label: {
                show: true,
                position: 'right',
                color: '#52514e',
                fontSize: 11,
                formatter: (p: { value: number }) => `${p.value.toLocaleString()} · ${share(p.value)}`,
            },
        }],
    }), [used, applications]);

    const unusedNote = (f: FilterUse) => {
        const kept = [f.keptBy > 0 ? `kept by ${f.keptBy}` : '', f.inSavedFilters > 0 ? `in ${f.inSavedFilters} saved filters` : ''].filter(Boolean).join(', ');
        return kept === '' ? f.filterId : `${f.filterId} (${kept})`;
    };

    return (
        <ChartCard
            title="Filters by use"
            note={`How many of the ${applications.toLocaleString()} applications of filters set each filter`}
            table={{
                columns: ['Filter', 'Applications', 'Share', 'Users', 'Kept by', 'In saved filters'],
                rows: [...used, ...unused].map(f => [label(f), f.applications, share(f.applications), f.users, f.keptBy, f.inSavedFilters]),
            }}
        >
            {used.length > 0
                ? <EChart option={option} height={used.length * 26 + 8} label="Filters by how many applications set them" />
                : <p className="chart-empty">{noFilterSet(applications, triggers, panelOpens)}</p>}
            {unused.length > 0 && (
                <p className="chart-note unused-filters">
                    <strong>Not set in this period ({unused.length} of {unused.length + used.filter(f => f.inDefinition && !f.removed).length}):</strong>
                    {' '}{unused.map(unusedNote).join(', ')}
                </p>
            )}
        </ChartCard>
    );
}

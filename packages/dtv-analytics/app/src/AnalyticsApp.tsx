import { useCallback, useEffect, useState } from 'react';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { getSource, type SourceInfo } from './api';
import { ConnectForm } from './ConnectForm';
import { isoDate, lastDay, navigate, useLocation, usePeriod } from './location';
import { MissingPeriods } from './MissingPeriods';
import { DataPage } from './pages/DataPage';
import { ErrorsPage } from './pages/ErrorsPage';
import { SavedFiltersPage } from './pages/SavedFiltersPage';
import { UserPage } from './pages/UserPage';
import { UsersPage } from './pages/UsersPage';
import { ViewPage } from './pages/ViewPage';
import { ViewsPage } from './pages/ViewsPage';

/** The pages, the period they share, and the source's credentials when it needs them. */
export function AnalyticsApp() {
    const [source, setSource] = useState<SourceInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Asks the store again once a fetch is done
    const [refresh, setRefresh] = useState(0);
    const { path } = useLocation();

    const loadSource = useCallback(() => {
        getSource().then(setSource, (e: unknown) => setError(String(e)));
    }, []);
    useEffect(loadSource, [loadSource]);
    // The server forgets credentials the source rejects: the form asks for new ones
    const onFetched = useCallback(() => {
        setRefresh(r => r + 1);
        loadSource();
    }, [loadSource]);

    if (error !== null) return <main><p className="error">The server cannot be reached: {error}</p></main>;
    if (source === null) return null;
    if (source.store === null) return <main><p className="error">The server has no store configured.</p></main>;

    const tab = tabOf(path);
    const link = (to: string, label: string) => (
        <a href={to} aria-current={tab === to ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate(to); }}>{label}</a>
    );

    return (
        <>
            <header className="app-header">
                <h1>DTV analytics</h1>
                <nav>
                    {link('/', 'Views')}
                    {link('/users', 'Users')}
                    {link('/saved-filters', 'Saved filters')}
                    {link('/errors', 'Errors')}
                    {link('/data', 'Data')}
                </nav>
                <PeriodPicker />
                <span className="source">{source.name}: {source.endpoint}</span>
            </header>
            <main>
                {!source.connected && <ConnectForm onConnected={loadSource} />}
                {path !== '/data' && (
                    <MissingPeriods store={source.store} connected={source.connected} refresh={refresh} onFetched={onFetched} />
                )}
                <Page path={path} store={source.store} connected={source.connected} refresh={refresh} onFetched={onFetched} />
            </main>
        </>
    );
}

function Page({ path, store, connected, refresh, onFetched }: {
    path: string;
    store: string;
    connected: boolean;
    refresh: number;
    onFetched: () => void;
}) {
    const view = /^\/view\/(.+)$/.exec(path);
    if (view?.[1] !== undefined) return <ViewPage key={view[1]} store={store} definition={decodeURIComponent(view[1])} refresh={refresh} />;
    const user = /^\/user\/(\d+)$/.exec(path);
    if (user?.[1] !== undefined) return <UserPage key={user[1]} store={store} userId={user[1]} refresh={refresh} />;
    switch (path) {
        case '/users': return <UsersPage store={store} refresh={refresh} />;
        case '/saved-filters': return <SavedFiltersPage store={store} refresh={refresh} />;
        case '/errors': return <ErrorsPage store={store} refresh={refresh} />;
        case '/data': return <DataPage store={store} connected={connected} onFetched={onFetched} />;
        default: return <ViewsPage store={store} refresh={refresh} />;
    }
}

/** The tab a page belongs to: a definition's page to Views, a user's to Users. */
function tabOf(path: string): string {
    if (path.startsWith('/view/')) return '/';
    if (path.startsWith('/user/')) return '/users';
    return path;
}

function PeriodPicker() {
    const period = usePeriod();
    return (
        <div className="period">
            <Calendar
                selectionMode="range"
                value={[period.from, lastDay(period)]}
                onChange={e => {
                    const [from, to] = e.value ?? [];
                    if (from && to) {
                        navigate(null, { from: isoDate(from), to: isoDate(to) });
                    }
                }}
                dateFormat="yy-mm-dd"
                showIcon
                readOnlyInput
            />
            <label>
                <Checkbox
                    checked={period.withImpersonated}
                    onChange={e => navigate(null, { impersonated: e.checked ? '1' : null })}
                />
                {' '}Impersonated
            </label>
        </div>
    );
}

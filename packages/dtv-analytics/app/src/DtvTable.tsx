import { useMemo } from 'react';
import { App, type View } from '@kronor/dtv';
import { usePeriod, type Period } from './location';

/**
 * A DTV table over the store. The view is built for the period, and built again when the period
 * changes; `refresh` reads the rows again after a fetch.
 */
export function DtvTable({ store, refresh, view, deps = [], showTitle = false }: {
    store: string;
    refresh: number;
    view: (period: Period) => View;
    /** What else the view is built from, such as the definition of a page. */
    deps?: unknown[];
    showTitle?: boolean;
}) {
    const period = usePeriod();
    const built = useMemo(
        () => view(period),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [period.from.getTime(), period.to.getTime(), period.withImpersonated, ...deps],
    );
    return (
        <div className="dtv">
            <App
                key={refresh}
                graphqlHost={store}
                requestHeaders={{}}
                views={[built]}
                showViewsMenu={false}
                showViewTitle={showTitle}
                syncFilterStateToUrl={false}
                rowsPerPageOptions={[50, 100, 200]}
            />
        </div>
    );
}

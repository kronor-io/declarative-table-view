import { useSyncExternalStore } from 'react';

/*
 * The page and what it shows are in the URL, so that a link shows what its sender saw:
 * the path names the page, the query the period and the switches.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    window.addEventListener('popstate', listener);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('popstate', listener);
    };
}

export function useLocation(): { path: string; query: URLSearchParams } {
    const href = useSyncExternalStore(subscribe, () => window.location.href);
    const url = new URL(href);
    return { path: url.pathname, query: url.searchParams };
}

/** Goes to `path` (or stays), with the query changed as given: `null` removes a parameter. */
export function navigate(path: string | null, query: Record<string, string | null> = {}, replace = false): void {
    const url = new URL(window.location.href);
    if (path !== null) url.pathname = path;
    for (const [key, value] of Object.entries(query)) {
        if (value === null) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
    }
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    listeners.forEach(listener => listener());
}

/**
 * The period of the URL, from the first day until the end of the last, 30 days by default. Days
 * are the browser's, as the charts' days are.
 */
export type Period = { from: Date; to: Date; withImpersonated: boolean };

/** A day's date in the URL, `YYYY-MM-DD`, in the browser's time zone. */
export const isoDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The start of a day in the browser's time zone. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseDay = (text: string) => {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export function usePeriod(): Period {
    const { query } = useLocation();
    const today = startOfDay(new Date());
    const from = query.get('from');
    const to = query.get('to');
    return {
        from: from === null ? addDays(today, -29) : parseDay(from),
        to: addDays(to === null ? today : parseDay(to), 1),
        withImpersonated: query.get('impersonated') === '1',
    };
}

/** The last day of a period, for showing it: the period ends before `to`. */
export const lastDay = (period: Period) => addDays(period.to, -1);

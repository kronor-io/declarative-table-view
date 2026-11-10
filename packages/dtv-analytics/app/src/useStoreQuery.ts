import { useEffect, useState } from 'react';
import { storeQuery } from './api';

/** A query to the store, asked again when its variables or `refresh` change. */
export function useStoreQuery<T>(store: string, query: string, variables: Record<string, unknown>, refresh: number): { data: T | null; error: string | null } {
    const [result, setResult] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
    const key = JSON.stringify(variables);
    useEffect(() => {
        let current = true;
        storeQuery<T>(store, query, JSON.parse(key) as Record<string, unknown>).then(
            data => { if (current) setResult({ data, error: null }); },
            (error: unknown) => { if (current) setResult({ data: null, error: String(error) }); },
        );
        return () => { current = false; };
    }, [store, query, key, refresh]);
    return result;
}

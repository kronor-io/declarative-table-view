import { createContext, useContext } from 'react';

import type { DTVAnalyticsEvent, DTVAnalyticsEventPayload, DTVAnalyticsSpan, ReportedEvent } from './analytics';
import { currentDefinitionRevision } from './view-migrations';
import type { View, ViewId } from './view';

/** The definition a view's events are reported for. */
export type ViewDefinition = { readonly definition: string; readonly definitionRevision: number };

export function viewDefinition(view: Pick<View, 'id' | 'migrations'>): ViewDefinition {
    return {
        definition: view.migrations?.latest.definition ?? view.id,
        definitionRevision: currentDefinitionRevision(view.migrations)
    };
}

/** Reports the events of one mounted table. */
export interface AnalyticsEmitter {
    /** Reports `payload` as an event of `viewId`. */
    emit(viewId: ViewId, payload: DTVAnalyticsEventPayload): void;
    /** The `seq` of the last `filtersApplied` reported; `null` before the first. */
    lastFiltersAppliedSeq(): number | null;
}

/** Identifies a mounted table in analytics events. */
export function newInstanceId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * An emitter numbering events from 1. `onEvent` is read at each event, so the host's
 * handler may change; while there is none, nothing is numbered or reported. What the
 * handler throws is logged: reporting must never break the table.
 */
export function createAnalyticsEmitter(
    instanceId: string,
    onEvent: () => ((event: DTVAnalyticsEvent) => void) | undefined,
    definitionOf: (viewId: ViewId) => ViewDefinition,
    now: () => number = Date.now
): AnalyticsEmitter {
    let seq = 0;
    let filtersAppliedSeq: number | null = null;

    return {
        emit(viewId, payload) {
            const handler = onEvent();
            if (handler === undefined) return;

            seq += 1;
            if (payload.type === 'filtersApplied') filtersAppliedSeq = seq;
            const event: DTVAnalyticsEvent = { instanceId, seq, at: now(), viewId, ...definitionOf(viewId), ...payload };
            try {
                handler(event);
            } catch (error) {
                console.error('The analytics event handler failed:', error);
            }
        },
        lastFiltersAppliedSeq: () => filtersAppliedSeq
    };
}

/** Measures a span: call the result when it ends. */
export function startSpan(now: () => number = Date.now, clock: () => number = () => performance.now()): () => DTVAnalyticsSpan {
    const startedAt = now();
    const start = clock();
    return () => ({ startedAt, durationMs: Math.round(clock() - start) });
}

/** Reports an event of the table's selected view (see `useAppState`). */
export type Track = (event: ReportedEvent) => void;

const noTracking: Track = () => undefined;

/** How components deep in a table report events. */
export const AnalyticsContext = createContext<Track>(noTracking);

export function useTrack(): Track {
    return useContext(AnalyticsContext);
}

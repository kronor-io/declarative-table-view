import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

import type { DTVAnalyticsEvent, DTVAnalyticsEventPayload, ReportedEvent } from '../analytics';
import { createAnalyticsEmitter, newInstanceId, startSpan } from '../analytics-emitter';
import type { FetchDataResult } from '../data';
import { toFetchError } from '../fetch-error';
import { initAppState, initialCommands, updateAppState, type AppState, type AppStateEnv, type AppStateInit, type Command, type Msg } from './app-state';
import { nextPageCursor, noRows, pendingRequest, type DataRequest } from './table';

/*
 * The interpreter of the app state: holds it, and carries out the effects
 * `updateAppState` asks for. It reports analytics events too: it numbers them, measures
 * requests, and reports what happens around the table's lifecycle, where messages cannot go.
 */

/** A command the host carries out. Analytics events (`track`, `cancelTrack`) are the interpreter's. */
export type HostCommand = Exclude<Command, { tag: 'track' | 'cancelTrack' }>;

/** How the effects of the app state are carried out. */
export interface AppStateEffects {
    /** Fetches the rows `request` asks for. Rejects with an AbortError once `signal` aborts. */
    readonly fetchRows: (request: DataRequest, signal: AbortSignal) => Promise<FetchDataResult>;
    readonly runCommand: (command: HostCommand) => void;
    /** Receives the table's analytics events. */
    readonly onEvent?: (event: DTVAnalyticsEvent) => void;
}

interface AppStateWithOutbox {
    readonly state: AppState;
    /** Commands `updateAppState` returned that have not run yet, oldest first. */
    readonly outbox: readonly Command[];
}

/** These commands of the outbox have run. */
type CommandsRun = { readonly tag: 'commandsRun'; readonly commands: readonly Command[] };

/** Where the table is in its lifecycle, as reporting events sees it. */
type Lifecycle =
    /** Rendering, before the first commit: events wait. */
    | { readonly tag: 'mounting'; readonly waiting: ReportedEvent[] }
    | { readonly tag: 'mounted' }
    /** Messages are not handled any more: events are reported as they come. */
    | { readonly tag: 'unmounted' };

/**
 * Holds the state of a table and runs the effects it asks for. The pending request is
 * fetched, and aborted once another one supersedes it or none is wanted any more, unmounting
 * included. Commands run once each, in order, and before the request their transition
 * started: the `filtersApplied` event a request's filters come from is reported before it.
 *
 * Returns `report` besides the state and `dispatch`: it reports an event of the selected
 * view at any time. While the table is mounted it is a message like any other; before, the
 * event waits for it to mount, and after, it is reported at once.
 */
export function useAppState(
    env: AppStateEnv,
    init: AppStateInit,
    effects: AppStateEffects
): [AppState, (msg: Msg) => void, (event: ReportedEvent) => void] {
    const [{ state, outbox }, dispatch] = useReducer(
        (current: AppStateWithOutbox, msg: Msg | CommandsRun): AppStateWithOutbox => {
            if (msg.tag === 'commandsRun') return { ...current, outbox: current.outbox.filter(command => !msg.commands.includes(command)) };

            const [state, all] = updateAppState(env, current.state, msg);
            const commands = withoutAnalytics(all, effects);
            if (state === current.state && commands.length === 0) return current;
            return { state, outbox: commands.length > 0 ? [...current.outbox, ...commands] : current.outbox };
        },
        init,
        (init): AppStateWithOutbox => ({ state: initAppState(env, init), outbox: withoutAnalytics(initialCommands(env, init), effects) })
    );

    // The latest environment, effects and view. Their identity changing is no reason to fetch again:
    // a new environment is sent as a message, and the state decides whether it reads the selected
    // view's rows differently.
    const latest = useRef({ env, effects, viewId: state.selectedViewId });
    useLayoutEffect(() => {
        const envChanged = latest.current.env !== env;
        latest.current = { env, effects, viewId: state.selectedViewId };
        if (envChanged) dispatch({ tag: 'envChanged' });
    });

    const [emitter] = useState(() => createAnalyticsEmitter(
        newInstanceId(),
        () => latest.current.effects.onEvent,
        viewId => latest.current.env.definition(viewId)
    ));

    // Events debounced by key, and the report each would send
    const debounced = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => void }>());

    const lifecycle = useRef<Lifecycle>({ tag: 'mounting', waiting: [] });
    // Events dispatched and not reported yet. Should the table unmount in the same batch, React
    // drops the messages: these are reported as it unmounts.
    const dispatched = useRef(new Set<DTVAnalyticsEventPayload>());
    const dispatchReported = useCallback((event: ReportedEvent) => {
        dispatched.current.add(event);
        dispatch({ tag: 'reported', event });
    }, []);
    const report = useCallback((event: ReportedEvent) => {
        if (latest.current.effects.onEvent === undefined) return;
        const current = lifecycle.current;
        switch (current.tag) {
            case 'mounting':
                current.waiting.push(event);
                return;
            case 'mounted':
                dispatchReported(event);
                return;
            case 'unmounted':
                emitter.emit(latest.current.viewId, event);
                return;
        }
    }, [dispatchReported, emitter]);

    useEffect(() => {
        const waiting = lifecycle.current.tag === 'mounting' ? lifecycle.current.waiting : [];
        lifecycle.current = { tag: 'mounted' };
        // After the first commands, which report that the table mounted
        waiting.forEach(dispatchReported);

        const pending = debounced.current;
        const undelivered = dispatched.current;
        return () => {
            lifecycle.current = { tag: 'unmounted' };
            // In development, StrictMode unmounts and mounts again at once: only a table
            // still unmounted once that is done has unmounted
            queueMicrotask(() => {
                if (lifecycle.current.tag !== 'unmounted') return;
                undelivered.forEach(event => emitter.emit(latest.current.viewId, event));
                undelivered.clear();
                // What waited for a pause would not be reported otherwise
                pending.forEach(({ timer, send }) => {
                    clearTimeout(timer);
                    send();
                });
                pending.clear();
                emitter.emit(latest.current.viewId, { type: 'viewUnmounted' });
            });
        };
    }, [dispatchReported, emitter]);

    // The commands run so far. StrictMode runs effects twice; each command runs once.
    const ran = useRef(new WeakSet<Command>());

    // Declared before the request's effect, so it runs first (see above)
    useEffect(() => {
        const commands = outbox.filter(command => !ran.current.has(command));
        if (commands.length === 0) return;

        for (const command of commands) {
            ran.current.add(command);
            switch (command.tag) {
                case 'track':
                    track(command);
                    break;
                case 'cancelTrack': {
                    const pending = debounced.current.get(command.key);
                    if (pending) clearTimeout(pending.timer);
                    debounced.current.delete(command.key);
                    break;
                }
                default:
                    latest.current.effects.runCommand(command);
            }
        }
        dispatch({ tag: 'commandsRun', commands });

        function track(command: Extract<Command, { tag: 'track' }>): void {
            dispatched.current.delete(command.event);
            const send = () => emitter.emit(command.viewId, command.event);
            if (command.debounce === undefined) {
                send();
                return;
            }
            const { key, ms } = command.debounce;
            const previous = debounced.current.get(key);
            if (previous) clearTimeout(previous.timer);
            debounced.current.set(key, {
                timer: setTimeout(() => {
                    debounced.current.delete(key);
                    send();
                }, ms),
                send
            });
        }
    }, [emitter, outbox]);

    const request = pendingRequest(state.table);
    useEffect(() => {
        if (!request) return;

        const { query } = request;
        const end = startSpan();
        const span = {
            type: 'fetch',
            reason: request.reason,
            page: query.cursors.length,
            rowsPerPage: query.rowsPerPage,
            ordering: query.ordering,
            // Commands ran first: the event of the request's filters is reported already
            filtersSeq: emitter.lastFiltersAppliedSeq()
        } as const;

        const controller = new AbortController();
        latest.current.effects.fetchRows(request, controller.signal).then(
            rows => {
                // Arrived as the request was superseded: the rows are not wanted
                if (controller.signal.aborted) {
                    emitter.emit(query.viewId, { ...span, ...end(), outcome: 'aborted' });
                    return;
                }
                const hasMore = nextPageCursor({ query, rows }) !== null;
                emitter.emit(query.viewId, { ...span, ...end(), outcome: 'succeeded', rowCount: rows.rows.length, hasMore });
                dispatch({ tag: 'rowsArrived', requestId: request.id, rows });
            },
            (error: unknown) => {
                // Aborted here: superseded, or no longer wanted
                if (controller.signal.aborted) {
                    emitter.emit(query.viewId, { ...span, ...end(), outcome: 'aborted' });
                    return;
                }
                emitter.emit(query.viewId, { ...span, ...end(), outcome: 'failed', error: toFetchError(error).info });
                // Any other failure, an abort from elsewhere included, must not leave the
                // table waiting for rows forever: it shows none
                console.error('Error fetching data:', error);
                dispatch({ tag: 'rowsArrived', requestId: request.id, rows: noRows });
            }
        );
        return () => controller.abort();
    }, [emitter, request]);

    return [state, dispatch, report];
}

/** Without a handler for analytics events, transitions report none: no commands, no renders. */
function withoutAnalytics(commands: Command[], effects: AppStateEffects): Command[] {
    return effects.onEvent === undefined ? commands.filter(command => command.tag !== 'track' && command.tag !== 'cancelTrack') : commands;
}

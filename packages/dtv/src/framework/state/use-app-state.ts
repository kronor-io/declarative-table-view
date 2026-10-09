import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

import type { FetchDataResult } from '../data';
import { initAppState, updateAppState, type AppState, type AppStateEnv, type AppStateInit, type Command, type Msg } from './app-state';
import { noRows, pendingRequest, type Query } from './table';

/*
 * The interpreter of the app state: holds it, and carries out the effects
 * `updateAppState` asks for.
 */

/** How the effects of the app state are carried out. */
export interface AppStateEffects {
    /** Fetches the rows `query` asks for. Rejects with an AbortError once `signal` aborts. */
    readonly fetchRows: (query: Query, signal: AbortSignal) => Promise<FetchDataResult>;
    readonly runCommand: (command: Command) => void;
}

interface AppStateWithOutbox {
    readonly state: AppState;
    /** Commands `updateAppState` returned that have not run yet, oldest first. */
    readonly outbox: readonly Command[];
}

/** The oldest `count` commands of the outbox have run. */
type CommandsRun = { readonly tag: 'commandsRun'; readonly count: number };

/**
 * Holds the state of a table and runs the effects it asks for. The pending request is
 * fetched, and aborted once another one supersedes it or none is wanted any more, unmounting
 * included. Commands run once each, in order.
 */
export function useAppState(env: AppStateEnv, init: AppStateInit, effects: AppStateEffects): [AppState, (msg: Msg) => void] {
    const [{ state, outbox }, dispatch] = useReducer(
        (current: AppStateWithOutbox, msg: Msg | CommandsRun): AppStateWithOutbox => {
            if (msg.tag === 'commandsRun') return { ...current, outbox: current.outbox.slice(msg.count) };

            const [state, commands] = updateAppState(env, current.state, msg);
            if (state === current.state && commands.length === 0) return current;
            return { state, outbox: commands.length > 0 ? [...current.outbox, ...commands] : current.outbox };
        },
        init,
        (init): AppStateWithOutbox => ({ state: initAppState(env, init), outbox: [] })
    );

    // The latest effects. Their identity changing is no reason to fetch again.
    const effectsRef = useRef(effects);
    useLayoutEffect(() => {
        effectsRef.current = effects;
    });

    const request = pendingRequest(state.table);
    useEffect(() => {
        if (!request) return;

        const controller = new AbortController();
        effectsRef.current.fetchRows(request.query, controller.signal).then(
            rows => dispatch({ tag: 'rowsArrived', requestId: request.id, rows }),
            (error: unknown) => {
                // Aborted here: superseded, or no longer wanted
                if (controller.signal.aborted) return;
                // Any other failure, an abort from elsewhere included, must not leave the
                // table waiting for rows forever: it shows none
                console.error('Error fetching data:', error);
                dispatch({ tag: 'rowsArrived', requestId: request.id, rows: noRows });
            }
        );
        return () => controller.abort();
    }, [request]);

    useEffect(() => {
        if (outbox.length === 0) return;

        for (const command of outbox) {
            effectsRef.current.runCommand(command);
        }
        dispatch({ tag: 'commandsRun', count: outbox.length });
    }, [outbox]);

    return [state, dispatch];
}

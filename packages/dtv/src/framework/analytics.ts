import type { DataOrdering } from './data-ordering';
import type { FetchErrorInfo } from './fetch-error';
import type { FilterId } from './filters';
import type { UndecodedFilterState } from './user-data-undecoded';
import type { ViewId } from './view';

/*
 * What a table reports about how it is used, through `AppProps.analytics`: what users do,
 * how long requests take, and what fails. DTV only reports; storing and analysing the
 * events is the host's.
 *
 * Every event says where it happened (`DTVAnalyticsEventBase`). Events with a duration
 * (spans) are reported once, when they end, with `startedAt` and `durationMs`.
 */

/** Where an event happened. */
export type DTVAnalyticsEventBase = {
    /**
     * Identifies the page session: from when DTV was loaded until the page is loaded again.
     * Its tables, however many, share it; another tab has another one.
     */
    readonly sessionId: string;
    /** Identifies one mounted table. A popout of it is another one. */
    readonly instanceId: string;
    /** Numbers the instance's events from 1, without gaps, in the order they were reported. */
    readonly seq: number;
    /** When the event was reported, in milliseconds since the epoch. */
    readonly at: number;
    readonly viewId: ViewId;
    /**
     * The view's definition: the id its migrations are kept under. Views built per record
     * (`asset-list-7`) share one. Without migrations, the view id.
     */
    readonly definition: string;
    /**
     * The revision of the definition the table runs with. Filter states in events are
     * written for it, and can be taken to a later revision with the view's migrations.
     */
    readonly definitionRevision: number;
};

/** What a span adds: it is reported when it ends. */
export type DTVAnalyticsSpan = {
    /** When it started, in milliseconds since the epoch. */
    readonly startedAt: number;
    readonly durationMs: number;
};

/** An error as events carry it. */
export type DTVAnalyticsError = {
    readonly name: string;
    readonly message: string;
};

/** What made a table apply filters. */
export type FiltersAppliedTrigger =
    /** The filter form was submitted. */
    | 'submit'
    /** All filters were reset in the filter form. */
    | 'reset'
    /** An applied filter's pill was removed. */
    | 'pillRemoved'
    /** A saved filter was applied. */
    | 'savedFilter'
    /** Host code applied them: a cell renderer, row expansion, no-rows component or action. */
    | 'api'
    /** The table opened with a filter state from a shared link, or one made elsewhere (e.g. by the app). */
    | 'link'
    /**
     * The table opened with the filter state it keeps in its URL (`syncFilterStateToUrl`): a
     * reload, its popout, or that URL copied from the address bar.
     */
    | 'url'
    /** The table opened with the filter state persisted in the user's data. */
    | 'restored'
    /** The table opened with the view's initial filter values. */
    | 'initial';

/** Why a table requested rows. */
export type FetchReason =
    /** Filters were applied, the table opening included. */
    | 'filters'
    | 'ordering'
    | 'rowsPerPage'
    | 'nextPage'
    | 'previousPage'
    /** The host asked for fresh rows, e.g. after a mutation. */
    | 'refresh'
    /** The rows per page or ordering changed in the user's data, e.g. in another tab. */
    | 'userData';

/** A panel below the menu bar, or the popout. */
export type DTVAnalyticsPanel = 'filters' | 'savedFilters' | 'preferences' | 'aiAssistant' | 'popout';

/** Filters whose stored state was dropped while the user's data was read. */
export type DTVAnalyticsResets = {
    readonly viewId: ViewId;
    readonly persistedFilterState: readonly FilterId[];
    readonly savedFilters: ReadonlyArray<{ readonly name: string; readonly filterIds: readonly FilterId[] }>;
};

/** A view's stored data left as stored while the user's data was read. */
export type DTVAnalyticsRetainedView = {
    readonly viewId: ViewId;
    /** `newerRevision`: written for a revision of the definition this table does not know yet (an old tab, a rollback). */
    readonly reason: 'newerRevision' | 'decodeFailed';
};

/** Why the user's data could not be read or written. */
export type DTVAnalyticsUserDataError = {
    readonly kind: 'externalLoadFailed' | 'externalSaveFailed' | 'localStorageFailed';
    readonly message: string;
};

export type DTVAnalyticsEventPayload =
    /**
     * The page session started: reported once per session, as the first event of the table that
     * reports one first.
     */
    | { readonly type: 'sessionStarted'; readonly dtvVersion: string }
    /** The table mounted. */
    | { readonly type: 'viewMounted'; readonly popout: boolean }
    /** The table unmounted. Spans still running end after it, as aborted. */
    | { readonly type: 'viewUnmounted' }
    /** The user switched views; `viewId` is the new one. */
    | { readonly type: 'viewSelected'; readonly previousViewId: ViewId }

    /**
     * Filters were applied, and rows are requested for them. `filters` is the state as user
     * data stores it: empty filters left out. Every `fetch` names the apply its filters come
     * from (`filtersSeq`).
     */
    | {
        readonly type: 'filtersApplied';
        readonly trigger: FiltersAppliedTrigger;
        readonly filters: UndecodedFilterState;
        /** The saved filter applied, for `trigger: 'savedFilter'`. */
        readonly savedFilter?: { readonly id: string; readonly name: string };
        /** The AI filter assistant filled the draft since filters were last applied. */
        readonly aiAssisted: boolean;
        /** For `trigger: 'link'` and `'url'`: the revision of the definition the link was made for. */
        readonly link?: { readonly definitionRevision: number };
    }
    | { readonly type: 'orderingChanged'; readonly ordering: DataOrdering | null }
    | { readonly type: 'rowsPerPageChanged'; readonly rowsPerPage: number }
    | { readonly type: 'hiddenColumnsChanged'; readonly hiddenColumns: readonly string[] }
    | { readonly type: 'panelShown'; readonly panel: DTVAnalyticsPanel; readonly shown: boolean }
    /** The user searched the view's filters; reported once typing pauses. */
    | { readonly type: 'filterSearch'; readonly query: string }
    | { readonly type: 'savedFilterSaved'; readonly savedFilterId: string; readonly name: string; readonly created: boolean; readonly filters: UndecodedFilterState }
    | { readonly type: 'savedFilterDeleted'; readonly savedFilterId: string }
    | { readonly type: 'shareLinkCreated'; readonly from: 'filterForm' | 'savedFilter' }
    | { readonly type: 'rowExpansionToggled'; readonly expanded: boolean }

    /** A request for rows ended. */
    | (DTVAnalyticsSpan & {
        readonly type: 'fetch';
        readonly reason: FetchReason;
        /** The page index: 0 for the first page. */
        readonly page: number;
        readonly rowsPerPage: number;
        readonly ordering: DataOrdering | null;
        /** The `seq` of the `filtersApplied` event the request's filters come from. */
        readonly filtersSeq: number | null;
        /** `aborted`: superseded by another request, or the table unmounted. */
        readonly outcome: 'succeeded' | 'failed' | 'aborted';
        readonly rowCount?: number;
        /** A full page arrived, so there may be a next one. */
        readonly hasMore?: boolean;
        readonly error?: FetchErrorInfo;
    })
    /**
     * The user's data was loaded and read, migrations to the views' current revisions
     * included. `failed`: the host's loader failed, and the table goes on with the local copy.
     */
    | (DTVAnalyticsSpan & {
        readonly type: 'userDataLoad';
        readonly outcome: 'succeeded' | 'failed';
        readonly source: 'remote' | 'local';
        /** Migrations changed what is stored. */
        readonly migrated: boolean;
        readonly resets: readonly DTVAnalyticsResets[];
        readonly retainedViews: readonly DTVAnalyticsRetainedView[];
        readonly error?: DTVAnalyticsUserDataError;
    })
    | (DTVAnalyticsSpan & {
        readonly type: 'action';
        /** The action's `id`, or its label. */
        readonly action: string;
        readonly selectedRows: number;
        readonly outcome: 'succeeded' | 'failed';
        readonly error?: DTVAnalyticsError;
    })
    /** The data of a lazily expanded row was loaded. */
    | (DTVAnalyticsSpan & { readonly type: 'rowExpansionLoad'; readonly outcome: 'succeeded' | 'failed'; readonly error?: DTVAnalyticsError })
    /** The AI filter assistant was asked to fill the filters. */
    | (DTVAnalyticsSpan & { readonly type: 'aiFilter'; readonly prompt: string; readonly outcome: 'succeeded' | 'failed'; readonly error?: DTVAnalyticsError })

    /** Writing the user's data failed. The change is kept locally. */
    | { readonly type: 'userDataSaveFailed'; readonly error: DTVAnalyticsUserDataError }
    /** The host rejected a write because another tab or device wrote first; it is applied on top of theirs. */
    | { readonly type: 'userDataConflict'; readonly resolved: boolean }
    /** The stored user data is in a format this version cannot read: changes are not saved. */
    | { readonly type: 'userDataReadOnly'; readonly message: string }
    /**
     * The view's filters differ from its latest snapshot: `dtv definitions snapshot` was not
     * run for a change. The stored state of the `changed` ones is reset.
     */
    | {
        readonly type: 'filtersChangedSinceSnapshot';
        readonly changed: readonly FilterId[];
        readonly added: readonly FilterId[];
        readonly removed: readonly FilterId[];
    }
    /** A filter's suggestion fetcher failed. */
    | { readonly type: 'suggestionsFailed'; readonly error: DTVAnalyticsError };

/** An event a table reports. Narrow it by `type`. */
export type DTVAnalyticsEvent = DTVAnalyticsEventBase & DTVAnalyticsEventPayload;

export type DTVAnalyticsEventType = DTVAnalyticsEvent['type'];

export interface DTVAnalytics {
    /**
     * Receives each event, synchronously, as it happens. Keep it cheap: queue the event and
     * send batches. What it throws is logged and otherwise ignored.
     */
    onEvent: (event: DTVAnalyticsEvent) => void;
}

/**
 * The events the table's components and its user data manager report; the state stamps them
 * with the selected view. The others come from transitions and the interpreter.
 */
export type ReportedEvent = Extract<DTVAnalyticsEventPayload, {
    readonly type:
        | 'hiddenColumnsChanged' | 'savedFilterSaved' | 'savedFilterDeleted' | 'shareLinkCreated' | 'rowExpansionToggled'
        | 'action' | 'rowExpansionLoad' | 'aiFilter' | 'suggestionsFailed'
        | 'userDataLoad' | 'userDataSaveFailed' | 'userDataConflict' | 'userDataReadOnly'
}>;

export function analyticsError(error: unknown): DTVAnalyticsError {
    return error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'Error', message: String(error) };
}

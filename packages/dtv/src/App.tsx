import { useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GraphQLClient } from 'graphql-request';
import Table, { type RowExpansionApi } from './components/Table';
import { nativeRuntime } from './framework/native-runtime';
import FilterForm from './components/FilterForm';
import { Menubar } from 'primereact/menubar';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import TablePagination from './components/TablePagination';
import LoadingOverlay from './components/LoadingOverlay';
import AIAssistantForm from './components/AIAssistantForm';
import type { AIIntegration, ModifyAiFilterPromptFn } from './components/aiAssistant';
import SavedFilterList from './components/SavedFilterList';
import UserPreferencesPanel from './components/UserPreferencesPanel';
import FilterStatePills from './components/FilterStatePills';
import { getFilterStatePillItems } from './components/filterStatePills.utils';
import { buildGraphQLQueryVariables, fetchData, type FetchDataResult, type FlattenedDataRow, flattenFieldQueries, getPaginationOrderFieldQueries, resolveHeadersMiddleware, type RequestHeaders } from './framework/data';
import { simplifyRow } from './framework/rows';
import { analyticsError, type DTVAnalytics } from './framework/analytics';
import { AnalyticsContext, startSpan, viewDefinition } from './framework/analytics-emitter';
import type { DataOrdering } from './framework/data-ordering';
import { buildInitialFormState, FilterState, FormStateInitMode, noRows, setFilterStateById, useAppState, type AppStateEnv, type Panel } from './framework/state';
import * as State from './framework/state';
import { parseViewJson } from './framework/view-parser';
import { getColumnOrderBy } from './framework/column-definition';
import { getAllFilters, getViewQuery, getViewRootFieldName, getViewStaticArgs, View, viewWithQuery, type SimplifiedRow } from './framework/view';
import { generateGraphQLQuery, generateGraphQLQueryAST, Hasura, hasuraFilterExpressionToObject, renderGraphQLQuery } from './framework/graphql';
import { generateColumnAliasedGraphQLQueryAST } from './framework/graphql/query';
import { SavedFilter } from './framework/saved-filters';
import { useUserDataManager } from './framework/useUserDataManager';
import type { UserDataJson } from './framework/user-data';
import { decodeFilterState, encodeFilterState } from './framework/filter-form-state';
import { viewMigrationContext } from './framework/user-data';
import { currentDefinitionRevision, migrateFilterState } from './framework/view-migrations';
import { Runtime } from './framework/runtime';
import { getFilterFromUrl, clearFilterFromUrl, createShareableUrl, copyToClipboard, setFilterInUrl } from './framework/filter-sharing';
import { DataTable } from 'primereact/datatable';
import { ActionDefinition, type ActionAPI, type ActionUserDataAPI, type ShownRows } from './framework/actions';
import ActionButtons from './components/ActionButtons';
import type { ShowToastFn } from './framework/toast'
import type { UserDataLoadAPI, UserDataSaveAPI } from './framework/user-data-manager'
import type { Result } from './framework/result'
import type { FilterId, FilterSchema } from './framework/filters'

/*
 * `V` is the type of the views, inferred from `views`, so that a selection callback gets their
 * rows typed (see `SimplifiedRow`).
 */
export interface AppProps<V extends View = View> {
    graphqlHost: string;
    /**
     * Headers sent with every GraphQL request. Pass a function to have it
     * resolved (and awaited) before each request — useful for a short-lived
     * bearer token. The function may be async, so a host that tracks its
     * token's expiry can refresh it proactively (e.g. against an endpoint)
     * before the request is sent. See `resolveHeadersMiddleware` in
     * framework/data.ts.
     */
    requestHeaders: RequestHeaders;
    /**
     * AI provider for the AI Filter Assistant: either the built-in Gemini
     * integration (`{ type: 'builtInGemini', geminiApiKey }`) or a custom
     * request function (`{ type: 'custom', requestAiFilter }`) that receives
     * the fully-built prompt and returns the model response (raw text or the
     * parsed filter-state object).
     *
     * Optional: when it is omitted the AI Filter Assistant is not offered at
     * all, so a host with no AI provider does not have to stub one out.
     */
    aiIntegration?: AIIntegration;
    /**
     * Optional already-parsed views.
     * When provided, `viewsJson` is ignored and no JSON parsing occurs.
     * When the selected view's source, function arguments, `staticConditions` or
     * `staticOrdering` change, its first page is asked for again and the row selection is
     * cleared; filters, ordering and rows per page stay.
     */
    views?: V[];

    /** JSON string containing array of view definitions (required if `views` is not provided). */
    viewsJson?: string;
    showViewsMenu: boolean;
    showViewTitle: boolean; // Option to show/hide view title
    showCsvExportButton?: boolean; // Controls visibility of the CSV export button (default false)
    showPopoutButton?: boolean; // Controls visibility of the Popout open button (default true)
    externalRuntime?: Runtime; // Optional external runtime that takes precedence over built-in runtimes
    isOverlay?: boolean; // Internal flag to avoid nesting popout buttons
    onCloseOverlay?: () => void; // Provided only to overlay instance to close parent overlay
    syncFilterStateToUrl: boolean; // When true, keep current filter state encoded in URL (dtv-filter-state)
    rowSelection?: {
        /** Type of row selection. 'none' disables selection UI. 'multiple' enables checkbox multi-select. */
        rowSelectionType: 'none' | 'multiple';
        /** Callback invoked whenever the row selection changes, with the rows as `SimplifiedRow` describes them */
        onRowSelectionChange?: (selectedRows: SimplifiedRow<V>[]) => void;
    };
    /** Optional array of custom action buttons rendered after built-in buttons in the menubar */
    actions?: ActionDefinition[];
    /** CSS classes for a row, each set when its value is true. Gets the row as `SimplifiedRow` describes it. */
    rowClassFunction?: (row: SimplifiedRow<V>) => Record<string, boolean>;
    rowsPerPageOptions?: number[]; // selectable page size options for pagination dropdown

    /** Optional imperative API for controlling the App instance. */
    apiRef?: React.RefObject<DTVAPI | null>;

    /**
        * Optional hook to modify the AI prompt template (built from schema + user prompt)
        * before it is sent to the AI provider.
     */
    modifyAiFilterPrompt?: ModifyAiFilterPromptFn;

    /**
     * Optional analytics: receives an event for what users do in the table, how long its
     * requests take, and what fails. See `DTVAnalyticsEvent`.
     */
    analytics?: DTVAnalytics;

    /** Optional user data integration hooks. */
    userData?: {
        /** Optional async loader invoked when the user-data manager is created. */
        onLoad?: (api: UserDataLoadAPI) => Promise<Result<string, UserDataJson | null>>;

        /** Optional async saver invoked whenever user data is saved (non-localStorage-only saves). */
        onSave?: (api: UserDataSaveAPI) => Promise<Result<string, void>>;
    };
}

export type DTVAPI = {
    /**
     * Forces the table to fetch data for the current view + filters, staying on
     * the page the user is on. Intended for refreshing after an out-of-band
     * mutation such as a mass action.
     */
    fetchData: () => void;

    rowSelection: {
        /** Resets any current row selection (no-op if row selection is disabled). */
        reset: () => void;
    };

    rowExpansion: {
        /** Collapses all expanded rows on the current page. */
        reset: () => void;
        collapseAll: () => void;
        expandAll: () => void;
    };

    /**
     * Runs the action of `actions` with this `id` as a click on its button would: the button
     * shows it running, a run while it is running or disabled does nothing, and it reports the
     * same analytics and failure toast. For a host that starts an action from a control of its
     * own, e.g. with the toolbar hidden. Does nothing, with a warning, for an id no action has.
     */
    runAction: (id: string) => void;
};

const builtInRuntime: Runtime = nativeRuntime

const DEFAULT_ROWS_PER_PAGE = 20
// A module constant, so that a table without `rowsPerPageOptions` keeps one identity across renders
const DEFAULT_ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200]

// The data query of each view, generated when the view is first fetched
const dataQueries = new WeakMap<View, string>()

function dataQueryFor(view: View): string {
    const cached = dataQueries.get(view)
    if (cached !== undefined) return cached

    const query = generateGraphQLQuery(
        getViewRootFieldName(view),
        view.columnDefinitions,
        view.boolExpType,
        view.orderByType,
        view.paginationKey,
        getViewStaticArgs(view),
        [
            ...getPaginationOrderFieldQueries(view),
            ...(view.rowExpansion?.lazy ? [] : view.rowExpansion?.data ?? [])
        ]
    )
    dataQueries.set(view, query)
    return query
}

// The query of each lazily expanded view's row expansion, generated when a row is first expanded
const lazyRowExpansionQueries = new WeakMap<View, string>()

function lazyRowExpansionQueryFor(view: View): string | null {
    if (!view.rowExpansion?.lazy) return null

    const cached = lazyRowExpansionQueries.get(view)
    if (cached !== undefined) return cached

    const query = generateGraphQLQuery(
        getViewRootFieldName(view),
        [],
        view.boolExpType,
        view.orderByType,
        view.paginationKey,
        getViewStaticArgs(view),
        view.rowExpansion.data
    )
    lazyRowExpansionQueries.set(view, query)
    return query
}

function App<V extends View = View>({
    graphqlHost,
    requestHeaders,
    aiIntegration,
    showViewsMenu,
    showViewTitle,
    showCsvExportButton = false,
    showPopoutButton = true,
    views: viewsFromProps,
    viewsJson,
    externalRuntime,
    isOverlay = false,
    onCloseOverlay,
    syncFilterStateToUrl = false,
    rowSelection,
    actions = [],
    rowClassFunction,
    rowsPerPageOptions = DEFAULT_ROWS_PER_PAGE_OPTIONS,
    userData,
    analytics,
    modifyAiFilterPrompt,
    apiRef
}: AppProps<V>) {
    const views = useMemo(() => {
        if (viewsFromProps) {
            return viewsFromProps;
        }
        if (!viewsJson) {
            throw new Error('App requires either "views" or "viewsJson"');
        }
        const viewDefinitions = JSON.parse(viewsJson);
        return viewDefinitions.map((view: unknown) => parseViewJson(view, builtInRuntime, externalRuntime));
    }, [viewsFromProps, viewsJson, externalRuntime]) as View[];

    const filterGroupsByViewId = useMemo(() => {
        return Object.fromEntries(views.map((view) => [view.id, view.filterGroups] as const));
    }, [views]);

    const migrationsByViewId = useMemo(() => {
        return Object.fromEntries(views.flatMap((view) => {
            const context = viewMigrationContext(view);
            return context === undefined ? [] : [[view.id, context] as const];
        }));
    }, [views]);

    const viewsById = useMemo(() => new Map(views.map(view => [view.id, view] as const)), [views]);

    // Determine the initial view and filter state (shared param precedence) BEFORE initializing app state
    const initialFromUrl = useMemo((): { viewId: string; filterState: FilterState; synced: boolean; definitionRevision: number } | undefined => {
        const shared = getFilterFromUrl();
        if (!shared) return undefined;
        // Links from before views were named in them are for the first view.
        const view = shared.view === null ? views[0] : viewsById.get(shared.view);
        if (!view) {
            console.warn(`The filter state in the URL is for view "${shared.view}", which this table does not have`);
            return undefined;
        }
        if (shared.definitionRevision > currentDefinitionRevision(view.migrations)) {
            console.warn(`The filter state in the URL is for a newer revision of view "${view.id}"`);
            return undefined;
        }
        const state = view.migrations === undefined
            ? shared.state
            : migrateFilterState(view.migrations, shared.definitionRevision, shared.state);
        return {
            viewId: view.id,
            filterState: decodeFilterState(state, view.filterGroups).state,
            synced: shared.synced,
            definitionRevision: shared.definitionRevision
        };
    }, [views, viewsById]);
    const initialFilterStateFromUrl = initialFromUrl?.filterState;

    // Resolve `requestHeaders` (which may be an async function) before every
    // request via a client-level middleware, so it covers all requests — table
    // fetches, lazy row expansion, and suggestion fetchers that use this client
    // directly. See resolveHeadersMiddleware.
    const client = useMemo(
        () => new GraphQLClient(graphqlHost, { requestMiddleware: resolveHeadersMiddleware(requestHeaders) }),
        [graphqlHost, requestHeaders]
    );

    const orderableFieldsByViewId = useMemo(() => new Map(views.map(view => [
        view.id,
        view.columnDefinitions.flatMap(column => {
            const orderBy = column.type === 'tableColumn' ? getColumnOrderBy(column) : undefined;
            return orderBy === undefined ? [] : [orderBy];
        })
    ] as const)), [views]);

    // What the state reads of the actions. Hosts often pass a new array on each render: a new
    // environment, and its `envChanged`, only when an action came, went or was disabled.
    const actionStatesKey = JSON.stringify(actions.map(action => [action.id, action.disabled === true]));
    const actionStates = useMemo(
        () => new Map((JSON.parse(actionStatesKey) as [string, boolean][]).map(([id, disabled]) => [id, { disabled }])),
        [actionStatesKey]
    );

    const appStateEnv = useMemo((): AppStateEnv => ({
        filterGroups: viewId => viewsById.get(viewId)?.filterGroups ?? [],
        rowsPerPageOptions,
        orderableFields: viewId => orderableFieldsByViewId.get(viewId) ?? [],
        definition: viewId => viewDefinition(viewsById.get(viewId) ?? { id: viewId }),
        snapshotDiff: viewId => migrationsByViewId[viewId]?.snapshotDiff ?? null,
        viewQuery: viewId => {
            const view = viewsById.get(viewId);
            return view ? getViewQuery(view) : null;
        },
        action: id => actionStates.get(id) ?? null
    }), [actionStates, migrationsByViewId, orderableFieldsByViewId, rowsPerPageOptions, viewsById]);

    // The state of the table, and the effects it asks for: see framework/state/app-state.ts.
    // Table behaviour goes there as messages and commands before it becomes an effect or a ref
    // here (README, "App State Before Effects").
    // `userDataManager` is only used by the effects, once rendering is done. `report` reports
    // analytics events of the selected view, for components and the user data.
    const [state, dispatch, report] = useAppState(
        appStateEnv,
        {
            viewId: initialFromUrl?.viewId ?? views[0].id,
            rowsPerPage: rowsPerPageOptions[0] ?? DEFAULT_ROWS_PER_PAGE,
            initialFilterState: initialFilterStateFromUrl,
            initialFilterStateSource: initialFromUrl && {
                trigger: initialFromUrl.synced ? 'url' : 'link',
                definitionRevision: initialFromUrl.definitionRevision
            },
            popout: isOverlay
        },
        {
            // Called as a method, so a handler may use `this`
            onEvent: analytics && (event => analytics.onEvent(event)),
            fetchRows: ({ query }, signal) => {
                const latestView = viewsById.get(query.viewId);
                if (!latestView) return Promise.reject(new Error(`Unknown view: ${query.viewId}`));
                // Read the way the query says, so the rows answer it
                const view = viewWithQuery(latestView, query.viewQuery);
                return fetchData({
                    client,
                    view,
                    query: dataQueryFor(view),
                    filterState: query.filters,
                    rowLimit: query.rowsPerPage,
                    cursor: query.cursors.at(-1) ?? null,
                    ordering: query.ordering,
                    signal
                });
            },
            runCommand: command => {
                switch (command.tag) {
                    case 'persistFilterState':
                        void userDataManager.setPersistedFilterState(command.viewId, command.filters);
                        return;
                    case 'persistRowsPerPage':
                        void userDataManager.setRowsPerPage(command.viewId, command.rowsPerPage);
                        return;
                    case 'persistOrdering':
                        void userDataManager.setOrdering(command.viewId, command.ordering);
                        return;
                    case 'notifyRowSelectionCleared':
                        rowSelection?.onRowSelectionChange?.([]);
                        return;
                    case 'runAction':
                        runAction(command.id);
                        return;
                    case 'warnUnknownAction':
                        console.warn(`There is no action with id "${command.id}" to run`);
                        return;
                }
            }
        }
    );

    const selectedView = viewsById.get(state.selectedViewId) ?? views[0];
    const filterState = state.filterState;
    const appliedFilterState = State.appliedFilterState(state.table);
    // The rows on screen, and the query they answer
    const shownPage = State.shownPage(state.table);
    const shownRows: FetchDataResult = shownPage?.rows ?? noRows;
    const rowsPerPage = state.rowsPerPage;
    const activeOrdering = state.orderingByViewId[selectedView.id] ?? null;

    const setSearchQuery = useCallback((searchQuery: string) => dispatch({ tag: 'searchQueryChanged', searchQuery }), [dispatch]);

    const filterSchemaById = useMemo(() => new Map<FilterId, FilterSchema>(
        getAllFilters(selectedView.filterGroups).map(filter => [filter.id, filter])
    ), [selectedView.filterGroups]);

    const appliedFilterItems = useMemo(() => {
        if (!appliedFilterState) return [];
        return getFilterStatePillItems(appliedFilterState, getAllFilters(selectedView.filterGroups));
    }, [appliedFilterState, selectedView.filterGroups]);

    const userDataManagerOptions = useMemo(() => {
        return {
            load: userData?.onLoad,
            save: userData?.onSave,
            showToast: (opts => toast.current?.show({ ...opts })) as ShowToastFn,
            migrationsByViewId
        }
    }, [userData?.onLoad, userData?.onSave, migrationsByViewId])

    const userDataManager = useUserDataManager(filterGroupsByViewId, selectedView.id, userDataManagerOptions, report);

    const syncFilterStateToUrlWithOverride = userDataManager.preferences.syncFilterStateToUrlOverride ?? syncFilterStateToUrl
    const closeFilterPanelOnApply = userDataManager.preferences.closeFilterPanelOnApply === true
    const syncFilterStateToUserData = userDataManager.viewData.syncFilterStateToUserData
    const actionUserData: ActionUserDataAPI = {
        preferences: userDataManager.preferences,
        viewData: userDataManager.viewData
    }

    // The user data of the selected view reaches the state as a message. Until it arrives (the
    // local copy, then the loaded one), the table cannot know its filters. It is sent again
    // whenever the state waits for it, e.g. after views were switched back and forth at once.
    const { isReady: isUserDataReady } = userDataManager;
    const {
        persistedFilterState,
        rowsPerPage: persistedRowsPerPage,
        syncOrderingToUserData,
        ordering: persistedOrdering
    } = userDataManager.viewData;
    const isAwaitingUserData = state.userData === null;
    useEffect(() => {
        dispatch({
            tag: 'userDataChanged',
            viewId: selectedView.id,
            userData: {
                ready: isUserDataReady,
                syncFilterState: syncFilterStateToUserData,
                persistedFilterState,
                rowsPerPage: persistedRowsPerPage,
                syncOrdering: syncOrderingToUserData,
                ordering: persistedOrdering
            }
        });
    }, [dispatch, isAwaitingUserData, isUserDataReady, persistedFilterState, persistedOrdering, persistedRowsPerPage, selectedView.id, syncFilterStateToUserData, syncOrderingToUserData]);

    const tableRef = useRef<DataTable<any>>(null);
    const toast = useRef<Toast>(null);
    const showFilterForm = state.activePanel === 'filters';
    const showSavedFilterList = state.activePanel === 'savedFilters';
    const showPreferencesPanel = state.activePanel === 'preferences';

    // Refetches the current page, e.g. after a mutation elsewhere
    const refresh = useCallback(() => dispatch({ tag: 'refreshRequested' }), [dispatch]);

    const setFilterState = useCallback((filters: FilterState) => dispatch({ tag: 'draftChanged', filters }), [dispatch]);

    const togglePanel = useCallback((panel: Panel) => dispatch({ tag: 'panelToggled', panel }), [dispatch]);

    const setFilterFormVisible = useCallback((shown: boolean) => dispatch({ tag: 'filterPanelShown', shown }), [dispatch]);

    const setSelectedRows = useCallback((rows: readonly unknown[]) => dispatch({ tag: 'rowsSelected', rows }), [dispatch]);

    const setFilterStateByAI = useCallback((filters: FilterState) => dispatch({ tag: 'draftChanged', filters, by: 'aiAssistant' }), [dispatch]);

    // The `applyFilters` handed to cell renderers, noRowsComponents, row
    // expansion renderers and actions. Runtime code sets a value with
    // `updateFilterById`/`setFilterState` (which only touch the draft filter
    // state) and then calls `applyFilters`. Messages are handled in the order
    // they are sent, so the draft applied is the one just set, not the one this
    // render captured.
    const applyFilters = useCallback(() => dispatch({ tag: 'draftApplied', trigger: 'api' }), [dispatch]);

    const dtvApi = useRef<DTVAPI>({
        fetchData: refresh,
        rowSelection: {
            reset: () => setSelectedRows([])
        },
        rowExpansion: {
            reset: () => undefined,
            collapseAll: () => undefined,
            expandAll: () => undefined
        },
        runAction: id => dispatch({ tag: 'actionRequested', id })
    });

    const handleRowExpansionApiChange = useCallback((api: RowExpansionApi | null) => {
        const collapseAll = () => api?.collapseAll();
        dtvApi.current.rowExpansion.reset = collapseAll;
        dtvApi.current.rowExpansion.collapseAll = collapseAll;
        dtvApi.current.rowExpansion.expandAll = () => api?.expandAll();
    }, []);

    const handleResetAppliedFilter = useCallback((filterId: FilterId) => {
        const filterSchema = filterSchemaById.get(filterId);
        if (!filterSchema) return;

        // Pills show only once filters are applied
        if (!appliedFilterState) return;

        const initialFilterState = buildInitialFormState(filterSchema.expression, FormStateInitMode.Empty);
        const nextDraftFilterState = setFilterStateById(filterState, filterId, initialFilterState);
        const nextAppliedFilterState = setFilterStateById(appliedFilterState, filterId, initialFilterState);

        setFilterState(nextDraftFilterState);
        dispatch({ tag: 'filtersApplied', filters: nextAppliedFilterState, trigger: 'pillRemoved' });
    }, [appliedFilterState, dispatch, filterSchemaById, filterState, setFilterState]);

    const applySavedFilter = useCallback((filter: SavedFilter) => {
        dispatch({ tag: 'filtersApplied', filters: filter.state, trigger: 'savedFilter', savedFilter: { id: filter.id, name: filter.name } });
    }, [dispatch]);

    const { setHiddenColumns: persistHiddenColumns } = userDataManager;
    const setHiddenColumns = useCallback((viewId: string, hiddenColumns: string[]) => {
        report({ type: 'hiddenColumnsChanged', hiddenColumns });
        return persistHiddenColumns(viewId, hiddenColumns);
    }, [persistHiddenColumns, report]);

    // The state keeps the rows as the table handed them out, so the table finds them on screen.
    // Actions and the host get them as `SimplifiedRow`s, which are worked out from the same
    // column queries simplifyRow merges.
    const selectedRows = useMemo(
        () => state.selectedRows.map(row => simplifyRow(row as FlattenedDataRow) as SimplifiedRow<V>),
        [state.selectedRows]
    );
    const handleSelectedRowsChange = useCallback((rows: FlattenedDataRow[]) => {
        setSelectedRows(rows);
        rowSelection?.onRowSelectionChange?.(rows.map(row => simplifyRow(row) as SimplifiedRow<V>));
    }, [rowSelection, setSelectedRows]);

    // Clear the selection if row selection gets disabled. Switching views clears it too
    // (see `viewSelected`).
    useEffect(() => {
        if ((rowSelection?.rowSelectionType ?? 'none') !== 'multiple') {
            setSelectedRows([]);
        }
    }, [rowSelection?.rowSelectionType, setSelectedRows]);

    // Expose imperative API to consumers.
    useEffect(() => {
        if (!apiRef) return;
        apiRef.current = dtvApi.current;
        return () => {
            apiRef.current = null;
        };
    }, [apiRef]);


    // Lock body scroll when popout is open (only in root instance)
    useEffect(() => {
        if (!isOverlay && state.showPopout) {
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previousOverflow;
            };
        }
    }, [state.showPopout, isOverlay]);

    // Close overlay on ESC key (only applies to overlay instance)
    useEffect(() => {
        if (!isOverlay) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseOverlay?.();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOverlay, onCloseOverlay]);

    // Pagination of the rows on screen
    const hasNextPage = State.hasNextPage(state.table);
    const hasPrevPage = State.hasPreviousPage(state.table);
    const paginationState = useMemo(() => State.paginationState(state.table, rowsPerPage), [rowsPerPage, state.table]);

    // The rows on screen as actions see them: all of it read off the query they answer
    const shownRowsForActions = useMemo((): ShownRows | null => {
        const shownView = shownPage && viewsById.get(shownPage.query.viewId);
        if (!shownPage || !shownView) return null;
        const { query } = shownPage;
        return {
            view: viewWithQuery(shownView, query.viewQuery),
            filterState: query.filters,
            ordering: query.ordering,
            rowsPerPage: query.rowsPerPage,
            cursors: [...query.cursors]
        };
    }, [shownPage, viewsById]);

    // Runs an action the state started (see `actionRequested`), with what is on screen now
    function runAction(id: string) {
        const end = startSpan();
        const ended = (outcome: 'succeeded' | 'failed', error?: unknown) => dispatch({
            tag: 'actionEnded',
            id,
            span: end(),
            outcome,
            ...(error === undefined ? {} : { error: analyticsError(error) })
        });
        const action = actions.find(candidate => candidate.id === id);
        if (!action) {
            ended('failed', new Error(`There is no action with id "${id}" to run`));
            return;
        }

        const api: ActionAPI = {
            view: selectedView,
            filterState,
            // A copy: an action changing it must not change the table's selection
            selectedRows: [...selectedRows],
            setFilterState,
            refetch: refresh,
            applyFilters,
            showToast: opts => toast.current?.show({ ...opts }),
            generateGraphQLQueryAST,
            generateColumnAliasedGraphQLQueryAST,
            renderGraphQLQuery,
            buildGraphQLQueryVariables,
            shownRows: shownRowsForActions,
            userData: actionUserData
        };
        // A handler that throws fails as one whose promise rejects
        new Promise<void>(resolve => resolve(action.onClick(api))).then(
            () => ended('succeeded'),
            (error: unknown) => {
                console.error('Action handler error', error);
                toast.current?.show({ severity: 'error', summary: 'Action Failed', detail: action.label, life: 3000 });
                ended('failed', error);
            }
        );
    }


    const handleOrderingChange = useCallback((ordering: DataOrdering | null) => {
        dispatch({ tag: 'orderingChanged', ordering });
    }, [dispatch]);

    // If we consumed a URL param and state syncing is off, clear it (once)
    const didHandleInitialUrlParam = useRef(false)
    useEffect(() => {
        if (didHandleInitialUrlParam.current) return
        if (!initialFilterStateFromUrl) return
        if (!syncFilterStateToUrlWithOverride) {
            clearFilterFromUrl();
            toast.current?.show({ severity: 'info', summary: 'Filter Loaded', detail: 'Loaded from URL', life: 3000 });
            didHandleInitialUrlParam.current = true
            return
        }
    }, [syncFilterStateToUrlWithOverride, initialFilterStateFromUrl]);

    // Keep the applied filter state in the URL. Only applying filters changes it, not
    // editing the draft.
    useEffect(() => {
        if (!syncFilterStateToUrlWithOverride) return;
        if (!appliedFilterState) return;
        setFilterInUrl(selectedView, appliedFilterState);
    }, [syncFilterStateToUrlWithOverride, appliedFilterState, selectedView]);

    // If URL syncing is disabled via preferences ("No"), immediately clear any existing URL state.
    useEffect(() => {
        if (syncFilterStateToUrlWithOverride) return;
        clearFilterFromUrl();
    }, [syncFilterStateToUrlWithOverride]);

    useEffect(() => {
        if (syncFilterStateToUserData) return;
        if (userDataManager.viewData.persistedFilterState === null) return;
        void userDataManager.setPersistedFilterState(selectedView.id, null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedView.id, syncFilterStateToUserData, userDataManager.setPersistedFilterState, userDataManager.viewData.persistedFilterState])

    // Save a new filter
    const handleSaveFilter = async (state: FilterState) => {
        const name = prompt('Enter a name for this filter:');
        if (!name) return;
        const saved = await userDataManager.createFilter({
            view: selectedView.id,
            name,
            state: state
        })
        report({ type: 'savedFilterSaved', savedFilterId: saved.id, name, created: true, filters: encodeFilterState(state, selectedView.filterGroups) });
    };

    // Update an existing filter
    const handleUpdateFilter = (filter: SavedFilter, state: FilterState) => {
        confirmDialog({
            message: `Are you sure you want to overwrite the existing filter "${filter.name}"?`,
            header: 'Confirm Filter Update',
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'reject',
            acceptClassName: 'p-button-danger',
            accept: async () => {
                if (await userDataManager.updateFilter(selectedView.id, filter.id, { state })) {
                    report({ type: 'savedFilterSaved', savedFilterId: filter.id, name: filter.name, created: false, filters: encodeFilterState(state, selectedView.filterGroups) });
                }
            },
            reject: () => {
                // User cancelled - no action needed
            }
        });
    };

    // Delete a saved filter
    const handleDeleteFilter = async (filterId: string) => {
        if (await userDataManager.deleteFilter(selectedView.id, filterId)) {
            report({ type: 'savedFilterDeleted', savedFilterId: filterId });
        }
    };

    // Share current filter state
    const handleShareFilter = async () => {
        try {
            const shareableUrl = createShareableUrl(selectedView, filterState);
            await copyToClipboard(shareableUrl);
            report({ type: 'shareLinkCreated', from: 'filterForm' });

            toast.current?.show({
                severity: 'success',
                summary: 'Filter Shared',
                detail: 'Shareable link copied to clipboard!',
                life: 3000
            });
        } catch (error) {
            console.error('Failed to share filter:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Share Failed',
                detail: 'Failed to create shareable link',
                life: 3000
            });
        }
    };

    // Share a specific saved filter state
    const handleShareSavedFilter = async (filterState: FilterState) => {
        try {
            const shareableUrl = createShareableUrl(selectedView, filterState);
            await copyToClipboard(shareableUrl);
            report({ type: 'shareLinkCreated', from: 'savedFilter' });

            toast.current?.show({
                severity: 'success',
                summary: 'Filter Shared',
                detail: 'Shareable link copied to clipboard!',
                life: 3000
            });
        } catch (error) {
            console.error('Failed to share saved filter:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Share Failed',
                detail: 'Failed to create shareable link',
                life: 3000
            });
        }
    };

    // Export current view as CSV
    const handleExportCSV = () => {
        if (tableRef.current) {
            tableRef.current.exportCSV({ selectionOnly: false });
        }
    };

    const fetchLazyRowExpansionData = useCallback(async ({ rowKey }: { row: Record<string, unknown>; rowKey: string | number }) => {
        // The expanded row is one on screen: it is fetched with the query that showed it, the
        // view query included, which the host may have changed since
        const shownView = shownPage && viewsById.get(shownPage.query.viewId);
        if (!shownPage || !shownView) return {};
        const view = viewWithQuery(shownView, shownPage.query.viewQuery);
        const rowExpansion = view.rowExpansion;
        const lazyRowExpansionQuery = lazyRowExpansionQueryFor(view);
        if (!rowExpansion?.lazy || !lazyRowExpansionQuery) {
            return {};
        }

        const variables = buildGraphQLQueryVariables(view, shownPage.query.filters, 1, null, shownPage.query.ordering);
        const rowKeyCondition = hasuraFilterExpressionToObject(Hasura.condition(view.paginationKey, { _eq: rowKey }));
        const hasBaseConditions = Object.keys(variables.conditions).length > 0;

        const response = await client.request(lazyRowExpansionQuery, {
            ...variables,
            conditions: hasBaseConditions
                ? { _and: [variables.conditions, rowKeyCondition] }
                : rowKeyCondition,
            paginationCondition: {},
            rowLimit: 1
        });

        const responseRoot = typeof response === 'object' && response !== null
            ? (response as Record<string, unknown>)[getViewRootFieldName(view)]
            : undefined;
        const row = Array.isArray(responseRoot) ? responseRoot[0] : undefined;

        if (!row || typeof row !== 'object') {
            return {};
        }

        return flattenFieldQueries(row as Record<string, unknown>, rowExpansion.data);
    }, [client, shownPage, viewsById]);

    const loadLazyRowExpansionData = useCallback(async (args: { row: Record<string, unknown>; rowKey: string | number }) => {
        const end = startSpan();
        try {
            const data = await fetchLazyRowExpansionData(args);
            report({ type: 'rowExpansionLoad', ...end(), outcome: 'succeeded' });
            return data;
        } catch (error) {
            report({ type: 'rowExpansionLoad', ...end(), outcome: 'failed', error: analyticsError(error) });
            throw error;
        }
    }, [fetchLazyRowExpansionData, report]);

    // When filter is loaded, set filter state
    const handleFilterLoad = (filterState: FilterState) => {
        dispatch({ tag: 'draftChanged', filters: filterState, by: 'savedFilter' });
    };

    const handleNextPage = () => dispatch({ tag: 'nextPageRequested' });
    const handlePrevPage = () => dispatch({ tag: 'previousPageRequested' });

    const handleRowsPerPageChange = (value: number) => dispatch({ tag: 'rowsPerPageChanged', rowsPerPage: value });

    // Components deep in the table report events through the context
    const table = (
        <div className='tw:p-2 tw:relative' style={{ height: '100%' }}>  {/* tw:relative is for loading overlay */}
            <Toast ref={toast} />
            <ConfirmDialog />

            <div className='tw:flex tw:flex-col' style={{ height: '100%' }}>
                <Menubar
                    model={[
                        ...(showViewsMenu ? [{
                            label: 'Views',
                            icon: 'pi pi-eye',
                            items: views.map((view: View) => ({
                                label: view.title,
                                icon: 'pi pi-table',
                                command: () => dispatch({ tag: 'viewSelected', viewId: view.id })
                            }))
                        }] : [])
                    ]}
                    className="tw:mb-4 tw:border-b"
                    start={
                        <div className="tw:flex tw:gap-2 tw:items-center">
                            <Button
                                type="button"
                                icon={showFilterForm ? 'pi pi-filter-slash' : 'pi pi-filter'}
                                outlined
                                size='small'
                                label={showFilterForm ? 'Hide Filters' : 'Filters'}
                                onClick={() => {
                                    if (showFilterForm) {
                                        // Clear search when hiding filters to avoid auto-expanding again
                                        setSearchQuery('');
                                    }
                                    togglePanel('filters');
                                }}
                            />
                            <Button
                                type="button"
                                icon='pi pi-bookmark'
                                outlined
                                size='small'
                                label={showSavedFilterList ? 'Hide Saved Filters' : 'Saved Filters'}
                                onClick={() => togglePanel('savedFilters')}
                            />
                            <Button
                                type="button"
                                icon='pi pi-cog'
                                outlined
                                size='small'
                                label={showPreferencesPanel ? 'Hide Preferences' : 'Preferences'}
                                onClick={() => togglePanel('preferences')}
                            />
                            {
                                showCsvExportButton && (
                                    <Button
                                        type="button"
                                        icon='pi pi-table'
                                        outlined
                                        size='small'
                                        label='Export page to CSV'
                                        onClick={handleExportCSV}
                                        data-testid="export-csv-button"
                                    />
                                )
                            }
                            {
                                showPopoutButton && (
                                    <Button
                                        type="button"
                                        icon={isOverlay ? 'pi pi-times' : 'pi pi-window-maximize'}
                                        outlined
                                        size='small'
                                        label={isOverlay ? 'Close Popout' : 'Popout'}
                                        onClick={() => {
                                            if (isOverlay) {
                                                onCloseOverlay?.();
                                            } else {
                                                dispatch({ tag: 'popoutShown', shown: true });
                                            }
                                        }}
                                    />
                                )
                            }
                            {
                                actions.length > 0 && (
                                    <Divider layout="vertical" />
                                )
                            }
                            <ActionButtons
                                actions={actions}
                                isRunning={id => state.runningActions.has(id)}
                                onClick={id => dispatch({ tag: 'actionRequested', id })}
                            />
                        </div>
                    }
                    end={
                        <div className="tw:flex tw:gap-2">
                            <IconField iconPosition="left">
                                <InputIcon className="pi pi-search" />
                                <InputText value={state.searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search filters..." />
                            </IconField>
                            {
                                aiIntegration && (
                                    <Button
                                        type="button"
                                        size='small'
                                        icon='pi pi-sparkles'
                                        label='AI Filter Assistant'
                                        onClick={() => dispatch({ tag: 'aiAssistantToggled' })}
                                    />
                                )
                            }
                        </div>
                    }
                />
                {
                    (showViewTitle || isOverlay) && (
                        <h1 className="tw:text-2xl tw:mb-4 tw:font-bold">{selectedView.title}</h1>
                    )
                }

                {
                    state.showAIAssistant && aiIntegration && (
                        <div className="tw:mb-6">
                            <AIAssistantForm
                                filterState={filterState}
                                setFilterState={setFilterStateByAI}
                                selectedView={selectedView}
                                aiIntegration={aiIntegration}
                                toast={toast}
                                setShowFilterForm={setFilterFormVisible}
                                modifyAiFilterPrompt={modifyAiFilterPrompt}
                            />
                        </div>
                    )
                }

                <SavedFilterList
                    savedFilters={userDataManager.savedFilters}
                    onFilterDelete={handleDeleteFilter}
                    onFilterLoad={handleFilterLoad}
                    onFilterApply={applySavedFilter}
                    onFilterShare={handleShareSavedFilter}
                    visible={showSavedFilterList}
                    filterGroups={selectedView.filterGroups}
                />

                <UserPreferencesPanel
                    visible={showPreferencesPanel}
                    preferences={userDataManager.preferences}
                    onChangePreferences={userDataManager.updatePreferences}
                    currentView={{ id: selectedView.id, title: selectedView.title }}
                    viewData={userDataManager.viewData}
                    columnDefinitions={selectedView.columnDefinitions}
                    onSetHiddenColumns={setHiddenColumns}
                    onSetSyncFilterStateToUserData={userDataManager.setSyncFilterStateToUserData}
                    onSetSyncOrderingToUserData={userDataManager.setSyncOrderingToUserData}
                />

                {
                    showFilterForm && (
                        <FilterForm
                            filterGroups={selectedView.filterGroups}
                            filterState={filterState}
                            setFilterState={setFilterState}
                            onSaveFilter={handleSaveFilter}
                            onUpdateFilter={handleUpdateFilter}
                            onShareFilter={handleShareFilter}
                            savedFilters={userDataManager.savedFilters}
                            displayState={state.filterDisplayState}
                            onFilterGroupExpandedChange={(groupName, expanded) => {
                                dispatch({ tag: 'filterGroupExpandedChanged', groupName, expanded });
                            }}
                            onSubmit={trigger => {
                                // `FilterForm` is fully controlled by
                                // `state.filterState`, so submitting is exactly
                                // the draft-to-applied promotion `applyFilters`
                                // performs.
                                dispatch({ tag: 'draftApplied', trigger });
                                if (closeFilterPanelOnApply) {
                                    setFilterFormVisible(false);
                                }
                            }}
                            graphqlClient={client}
                        />
                    )
                }
                {
                    !showFilterForm && appliedFilterItems.length > 0 && (
                        <div className="tw:mb-4">
                            <FilterStatePills
                                items={appliedFilterItems}
                                label="Applied Filters:"
                                onRemove={handleResetAppliedFilter}
                            />
                        </div>
                    )
                }
                <div style={{ flexShrink: 1, minHeight: 0 }}>
                    <Table
                        viewId={selectedView.id}
                        ref={tableRef}
                        columns={selectedView.columnDefinitions}
                        hiddenColumnIds={userDataManager.viewData.hiddenColumns}
                        paginationKey={selectedView.paginationKey}
                        data={shownRows.flattenedRows}
                        rawRows={shownRows.rows}
                        rowExpansion={selectedView.rowExpansion}
                        loadLazyRowExpansionData={selectedView.rowExpansion?.lazy ? loadLazyRowExpansionData : undefined}
                        noRowsComponent={selectedView.noRowsComponent}
                        setFilterState={setFilterState}
                        filterState={filterState}
                        applyFilters={applyFilters}
                        rowSelectionType={rowSelection?.rowSelectionType ?? 'none'}
                        selectedRows={state.selectedRows}
                        onSelectedRowsChange={handleSelectedRowsChange}
                        rowClassFunction={rowClassFunction}
                        onRowExpansionApiChange={handleRowExpansionApiChange}
                        ordering={activeOrdering}
                        onOrderingChange={handleOrderingChange}
                    />
                </div>
                {
                    shownRows.rows.length > 0 && (
                        <TablePagination
                            onPageChange={handleNextPage}
                            onPrevPage={handlePrevPage}
                            hasNextPage={hasNextPage}
                            hasPrevPage={hasPrevPage}
                            currentPage={paginationState.page}
                            rowsPerPage={rowsPerPage}
                            actualRows={shownRows.rows.length}
                            onRowsPerPageChange={handleRowsPerPageChange}
                            rowsPerPageOptions={rowsPerPageOptions}
                        />
                    )
                }
            </div>
            {State.isLoading(state.table) && <LoadingOverlay message="Loading data…" />}
            {state.showPopout && !isOverlay && createPortal(
                <div className="tw:fixed tw:inset-0 tw:bg-white tw:overflow-auto tw:z-10">
                    <App
                        graphqlHost={graphqlHost}
                        requestHeaders={requestHeaders}
                        aiIntegration={aiIntegration}
                        showViewsMenu={showViewsMenu}
                        showViewTitle={showViewTitle}
                        showCsvExportButton={showCsvExportButton}
                        showPopoutButton={showPopoutButton}
                        views={viewsFromProps}
                        viewsJson={viewsJson}
                        externalRuntime={externalRuntime}
                        isOverlay={true}
                        onCloseOverlay={() => dispatch({ tag: 'popoutShown', shown: false })}
                        syncFilterStateToUrl={syncFilterStateToUrl}
                        rowSelection={rowSelection}
                        rowClassFunction={rowClassFunction}
                        rowsPerPageOptions={rowsPerPageOptions}
                        modifyAiFilterPrompt={modifyAiFilterPrompt}
                        analytics={analytics}
                    />
                </div>,
                document.body
            )}
        </div>
    );
    return <AnalyticsContext.Provider value={report}>{table}</AnalyticsContext.Provider>;
}

export default App;

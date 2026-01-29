import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GraphQLClient } from 'graphql-request';
import Table, { RowSelectionAPI } from './components/Table';
import { nativeRuntime } from './framework/native-runtime';
import FilterForm from './components/FilterForm';
import { Menubar } from 'primereact/menubar';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import TablePagination from './components/TablePagination';
import LoadingOverlay from './components/LoadingOverlay';
import AIAssistantForm from './components/AIAssistantForm';
import SavedFilterList from './components/SavedFilterList';
import UserPreferencesPanel from './components/UserPreferencesPanel';
import { fetchData, FetchDataResult } from './framework/data';
import { FilterState, useAppState } from './framework/state';
import { FilterSchema, FilterSchemasAndGroups, getFieldNodes, FilterField, FilterId } from './framework/filters';
import { parseViewJson } from './framework/view-parser';
import { View, ViewId } from './framework/view';
import { generateGraphQLQuery } from './framework/graphql';
import { SavedFilter } from './framework/saved-filters';
import { useUserDataManager } from './framework/useUserDataManager';
import type { UserDataJson } from './framework/user-data';
import { parseFilterFormState } from './framework/filter-form-state';
import { ColumnDefinition } from './framework/column-definition';
import { Runtime } from './framework/runtime';
import { getFilterFromUrl, clearFilterFromUrl, createShareableUrl, copyToClipboard, setFilterInUrl } from './framework/filter-sharing';
import { DataTable } from 'primereact/datatable';
import { ActionDefinition } from './framework/actions';
import ActionButtons from './components/ActionButtons';
import type { ShowToastFn } from './framework/toast'
import type { UserDataLoadAPI, UserDataSaveAPI } from './framework/user-data-manager'
import type { Result } from './framework/result'

export interface AppProps {
    graphqlHost: string;
    graphqlToken: string;
    geminiApiKey: string;
    viewsJson: string; // JSON string containing array of view definitions
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
        /** Callback invoked whenever the row selection changes */
        onRowSelectionChange?: (selectedRows: any[]) => void;
        /** React ref that will be populated with RowSelectionAPI (e.g. resetRowSelection) */
        apiRef?: React.RefObject<RowSelectionAPI | null>;
    };
    /** Optional array of custom action buttons rendered after built-in buttons in the menubar */
    actions?: ActionDefinition[];
    rowClassFunction?: (row: Record<string, any>) => Record<string, boolean>;
    rowsPerPageOptions?: number[]; // selectable page size options for pagination dropdown

    /** Optional user data integration hooks. */
    userData?: {
        /** Optional async loader invoked when the user-data manager is created. */
        onLoad?: (api: UserDataLoadAPI) => Promise<Result<string, UserDataJson | null>>;

        /** Optional async saver invoked whenever user data is saved (non-localStorage-only saves). */
        onSave?: (api: UserDataSaveAPI) => Promise<Result<string, void>>;
    };
}

const builtInRuntime: Runtime = nativeRuntime

function App({
    graphqlHost,
    graphqlToken,
    geminiApiKey,
    showViewsMenu,
    showViewTitle,
    showCsvExportButton = false,
    showPopoutButton = true,
    viewsJson,
    externalRuntime,
    isOverlay = false,
    onCloseOverlay,
    syncFilterStateToUrl = false,
    rowSelection,
    actions = [],
    rowClassFunction,
    rowsPerPageOptions = [20, 50, 100, 200],
    userData
}: AppProps) {
    const views = useMemo(() => {
        const viewDefinitions = JSON.parse(viewsJson);
        return viewDefinitions.map((view: unknown) => parseViewJson(view, builtInRuntime, externalRuntime));
    }, [viewsJson, externalRuntime]) as View[];

    const filterSchemasByViewId: Record<ViewId, FilterSchemasAndGroups> = useMemo(() => {
        return Object.fromEntries(views.map((view) => [view.id, view.filterSchema] as const));
    }, [views]);

    // Determine initial filter state (shared param precedence) BEFORE initializing app state
    const initialFilterStateFromUrl = useMemo(() => {
        const raw = getFilterFromUrl();
        if (!raw) return undefined;
        try {
            const firstView = views[0];
            if (!firstView) return undefined;
            return parseFilterFormState(raw, firstView.filterSchema);
        } catch (e) {
            console.warn('Invalid initial filter state from URL, falling back to defaults', e);
            return undefined;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewsJson]);

    const { state, selectedView, setSelectedViewId, setFilterSchema, setFilterState, setDataRows, setRowsPerPage } = useAppState(views, rowsPerPageOptions, initialFilterStateFromUrl as any);

    const userDataManagerOptions = useMemo(() => {
        return {
            load: userData?.onLoad,
            save: userData?.onSave,
            showToast: (opts => toast.current?.show({ ...opts })) as ShowToastFn
        }
    }, [userData?.onLoad, userData?.onSave])

    const userDataManager = useUserDataManager(filterSchemasByViewId, selectedView.id, userDataManagerOptions);

    const syncFilterStateToUrlWithOverride = userDataManager.preferences.syncFilterStateToUrlOverride ?? syncFilterStateToUrl

    const client = useMemo(() => new GraphQLClient(graphqlHost, {
        headers: {
            contentType: 'application/json',
            Authorization: `Bearer ${graphqlToken}`
        },
    }), [graphqlHost, graphqlToken]);

    // Memoized GraphQL query generation for the selected view
    const memoizedQuery = useMemo(() => {
        return generateGraphQLQuery(
            selectedView.collectionName,
            selectedView.columnDefinitions as ColumnDefinition[],
            selectedView.boolExpType,
            selectedView.orderByType,
            selectedView.paginationKey
        );
    }, [selectedView.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const [search, setSearch] = useState('');
    const tableRef = useRef<DataTable<any>>(null);
    const toast = useRef<Toast>(null);
    const [showAIAssistantForm, setShowAIAssistantForm] = useState(false);
    const [showFilterForm, setShowFilterForm] = useState(false);
    const [showSavedFilterList, setShowSavedFilterList] = useState(false);
    const [showPreferencesPanel, setShowPreferencesPanel] = useState(false);
    const [refetchTrigger, setRefetchTrigger] = useState(0);
    const [showPopout, setShowPopout] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Auto-expand filter panel when user starts typing a search (help discover filters)
    useEffect(() => {
        if (search && !showFilterForm) {
            setShowFilterForm(true);
        }
    }, [search, showFilterForm]);

    // Lock body scroll when popout is open (only in root instance)
    useEffect(() => {
        if (!isOverlay && showPopout) {
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previousOverflow;
            };
        }
    }, [showPopout, isOverlay]);

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

    // Pagination derived values
    const rowsPerPage = state.pagination.rowsPerPage;
    const hasNextPage = state.data.rows.length === rowsPerPage;
    const hasPrevPage = state.pagination.page > 0;

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

    // Persist current filter state only when filters are applied (refetchTrigger increments)
    useEffect(() => {
        if (!syncFilterStateToUrlWithOverride) return;
        // Only write after an application event (refetchTrigger change), not on every keystroke
        setFilterInUrl(state.filterState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncFilterStateToUrlWithOverride, refetchTrigger]);

    // If URL syncing is disabled via preferences ("No"), immediately clear any existing URL state.
    useEffect(() => {
        if (syncFilterStateToUrlWithOverride) return;
        clearFilterFromUrl();
    }, [syncFilterStateToUrlWithOverride]);

    // Save a new filter
    const handleSaveFilter = async (state: FilterState) => {
        const name = prompt('Enter a name for this filter:');
        if (!name) return;
        await userDataManager.createFilter({
            view: selectedView.id,
            name,
            state: state
        })
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
                await userDataManager.updateFilter(selectedView.id, filter.id, { state })
            },
            reject: () => {
                // User cancelled - no action needed
            }
        });
    };

    // Delete a saved filter
    const handleDeleteFilter = async (filterId: string) => {
        await userDataManager.deleteFilter(selectedView.id, filterId)
    };

    // Share current filter state
    const handleShareFilter = async () => {
        try {
            const shareableUrl = createShareableUrl(state.filterState);
            await copyToClipboard(shareableUrl);

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
            const shareableUrl = createShareableUrl(filterState);
            await copyToClipboard(shareableUrl);

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

    const fetchDataWrapper = useCallback((cursor: string | number | null, rowLimit: number): Promise<FetchDataResult> => {
        return fetchData({
            client,
            view: selectedView,
            query: memoizedQuery,
            filterState: state.filterState,
            rowLimit,
            cursor
        });
    }, [client, selectedView, memoizedQuery, state.filterState]);

    // Apply per-view rowsPerPage from user data (when present)
    useEffect(() => {
        const persisted = userDataManager.viewData.rowsPerPage
        if (typeof persisted !== 'number') return
        if (rowsPerPageOptions.length > 0 && !rowsPerPageOptions.includes(persisted)) return
        if (persisted === rowsPerPage) return
        setRowsPerPage(persisted)
    }, [rowsPerPage, rowsPerPageOptions, setRowsPerPage, userDataManager.viewData.rowsPerPage])

    // Fetch data when view changes, rowsPerPage changes, or refetch is triggered
    useEffect(() => {
        setIsLoading(true);
        fetchDataWrapper(null, rowsPerPage)
            .then(dataRows => setDataRows(dataRows))
            .catch(error => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    // Request was aborted, no action needed
                    return;
                }
            })
            .finally(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedViewId, refetchTrigger, rowsPerPage]);

    // When filter is loaded, set filter state
    const handleFilterLoad = (filterState: FilterState) => {
        setFilterState(filterState);
    };

    // Filter filterSchema by search, get filter IDs
    const visibleFilterIds: FilterId[] = state.filterSchemasAndGroups.filters
        .flatMap((filter: FilterSchema) => {
            function stringMatchesSearchQuery(string: string) {
                return string.toLowerCase().includes(search.toLowerCase());
            }

            function fieldMatchesSearchQuery(field: FilterField): boolean {
                if (typeof field === 'string') {
                    return stringMatchesSearchQuery(field);
                } else if ('and' in field) {
                    return field.and.some((f: string) => stringMatchesSearchQuery(f));
                } else if ('or' in field) {
                    return field.or.some((f: string) => stringMatchesSearchQuery(f));
                }
                return false;
            }

            if (stringMatchesSearchQuery(filter.label)) return [filter.id];
            const fieldFilterExprs = getFieldNodes(filter.expression);
            return fieldFilterExprs.some(expr => fieldMatchesSearchQuery(expr.field)) ? [filter.id] : []
        });

    // Next page handler
    const handleNextPage = async () => {
        const cursor = state.data.rows.length > 0 ? state.data.rows[state.data.rows.length - 1][selectedView.paginationKey] : null
        if (typeof cursor !== 'string' && typeof cursor !== 'number') {
            console.error('Invalid cursor type:', cursor);
            return;
        }
        setIsLoading(true);
        try {
            const newData = await fetchDataWrapper(cursor, rowsPerPage);
            setDataRows(
                newData,
                { page: state.pagination.page + 1, cursors: [...state.pagination.cursors, cursor], rowsPerPage }
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Previous page handler
    const handlePrevPage = async () => {
        if (state.pagination.page === 0) return;
        const prevCursors = state.pagination.cursors.slice(0, -1)
        const prevCursor = prevCursors[prevCursors.length - 1] ?? null;
        setIsLoading(true);
        try {
            const newData = await fetchDataWrapper(prevCursor, rowsPerPage)
            setDataRows(
                newData,
                { page: state.pagination.page - 1, cursors: prevCursors, rowsPerPage }
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Rows-per-page change handler: reset pagination; fetch is handled by effect
    const handleRowsPerPageChange = async (value: number) => {
        if (value === rowsPerPage) return;
        setRowsPerPage(value)
        await userDataManager.setRowsPerPage(selectedView.id, value)
    };

    return (
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
                                command: () => setSelectedViewId(view.id)
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
                                    setShowFilterForm(prev => {
                                        const next = !prev;
                                        if (!next) {
                                            // Clear search when hiding filters to avoid auto-expanding again
                                            setSearch('');
                                        }
                                        return next;
                                    });
                                }}
                            />
                            <Button
                                type="button"
                                icon='pi pi-bookmark'
                                outlined
                                size='small'
                                label={showSavedFilterList ? 'Hide Saved Filters' : 'Saved Filters'}
                                onClick={() => setShowSavedFilterList(v => !v)}
                            />
                            <Button
                                type="button"
                                icon='pi pi-cog'
                                outlined
                                size='small'
                                label={showPreferencesPanel ? 'Hide Preferences' : 'Preferences'}
                                onClick={() => setShowPreferencesPanel(v => !v)}
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
                                                setShowPopout(true);
                                            }
                                        }}
                                    />
                                )
                            }
                            <ActionButtons
                                actions={actions}
                                selectedView={selectedView}
                                filterState={state.filterState}
                                setFilterState={setFilterState}
                                refetch={() => setRefetchTrigger(prev => prev + 1)}
                                showToast={(opts: { severity: 'info' | 'success' | 'warn' | 'error'; summary: string; detail?: string; life?: number }) => toast.current?.show({ ...opts })}
                                paginationState={state.pagination}
                                rowsPerPage={rowsPerPage}
                            />
                        </div>
                    }
                    end={
                        <div className="tw:flex tw:gap-2">
                            <IconField iconPosition="left">
                                <InputIcon className="pi pi-search" />
                                <InputText value={search} onChange={e => setSearch(e.target.value)} placeholder="Search filters..." />
                            </IconField>
                            <Button
                                type="button"
                                size='small'
                                icon='pi pi-sparkles'
                                label='AI Filter Assistant'
                                onClick={() => setShowAIAssistantForm(v => !v)}
                            />
                        </div>
                    }
                />
                {
                    (showViewTitle || isOverlay) && (
                        <h1 className="tw:text-2xl tw:mb-4 tw:font-bold">{selectedView.title}</h1>
                    )
                }

                {
                    showAIAssistantForm && (
                        <div className="tw:mb-6">
                            <AIAssistantForm
                                filterSchema={state.filterSchemasAndGroups}
                                filterState={state.filterState}
                                setFilterSchema={setFilterSchema}
                                setFilterState={setFilterState}
                                selectedView={selectedView}
                                geminiApiKey={geminiApiKey}
                                toast={toast}
                                setShowFilterForm={setShowFilterForm}
                            />
                        </div>
                    )
                }

                <SavedFilterList
                    savedFilters={userDataManager.savedFilters}
                    onFilterDelete={handleDeleteFilter}
                    onFilterLoad={handleFilterLoad}
                    onFilterApply={() => setRefetchTrigger(prev => prev + 1)}
                    onFilterShare={handleShareSavedFilter}
                    visible={showSavedFilterList}
                    filterSchema={state.filterSchemasAndGroups}
                />

                <UserPreferencesPanel
                    visible={showPreferencesPanel}
                    preferences={userDataManager.preferences}
                    onChangePreferences={userDataManager.updatePreferences}
                />

                {
                    showFilterForm && (
                        <FilterForm
                            filterSchemasAndGroups={state.filterSchemasAndGroups}
                            filterState={state.filterState}
                            setFilterState={setFilterState}
                            onSaveFilter={handleSaveFilter}
                            onUpdateFilter={handleUpdateFilter}
                            onShareFilter={handleShareFilter}
                            savedFilters={userDataManager.savedFilters}
                            visibleFilterIds={visibleFilterIds}
                            onSubmit={() => {
                                setRefetchTrigger(prev => prev + 1);
                            }}
                            graphqlClient={client}
                        />
                    )
                }
                <div style={{ flexShrink: 1, minHeight: 0 }}>
                    <Table
                        viewId={selectedView.id}
                        ref={tableRef}
                        columns={selectedView.columnDefinitions}
                        data={state.data.flattenedRows}
                        noRowsComponent={selectedView.noRowsComponent}
                        setFilterState={setFilterState}
                        filterState={state.filterState}
                        triggerRefetch={() => setRefetchTrigger(prev => prev + 1)}
                        rowSelection={rowSelection}
                        rowClassFunction={rowClassFunction}
                    />
                </div>
                {
                    state.data.rows.length > 0 && (
                        <TablePagination
                            onPageChange={handleNextPage}
                            onPrevPage={handlePrevPage}
                            hasNextPage={hasNextPage}
                            hasPrevPage={hasPrevPage}
                            currentPage={state.pagination.page}
                            rowsPerPage={rowsPerPage}
                            actualRows={state.data.rows.length}
                            onRowsPerPageChange={handleRowsPerPageChange}
                            rowsPerPageOptions={rowsPerPageOptions}
                        />
                    )
                }
            </div>
            {isLoading && <LoadingOverlay message="Loading data…" />}
            {showPopout && !isOverlay && createPortal(
                <div className="tw:fixed tw:inset-0 tw:bg-white tw:overflow-auto tw:z-10">
                    <App
                        graphqlHost={graphqlHost}
                        graphqlToken={graphqlToken}
                        geminiApiKey={geminiApiKey}
                        showViewsMenu={showViewsMenu}
                        showViewTitle={showViewTitle}
                        showCsvExportButton={showCsvExportButton}
                        showPopoutButton={showPopoutButton}
                        viewsJson={viewsJson}
                        externalRuntime={externalRuntime}
                        isOverlay={true}
                        onCloseOverlay={() => setShowPopout(false)}
                        syncFilterStateToUrl={syncFilterStateToUrl}
                        rowSelection={rowSelection}
                        rowClassFunction={rowClassFunction}
                        rowsPerPageOptions={rowsPerPageOptions}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}

export default App;

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { GraphQLClient } from 'graphql-request';
import Table from './components/Table';
import { nativeRuntime } from './framework/native-runtime';
import FilterForm, { FilterFormState } from './components/FilterForm';
import { Menubar } from 'primereact/menubar';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import TablePagination from './components/TablePagination';
import AIAssistantForm from './components/AIAssistantForm';
import SavedFilterList from './components/SavedFilterList';
import { fetchData, FetchDataResult } from './framework/data';
import { useAppState } from './framework/state';
import { FilterFieldSchemaFilter, getFieldNodes, FilterField } from './framework/filters';
import { parseViewJson } from './framework/view-parser';
import { View } from './framework/view';
import { generateGraphQLQuery } from './framework/graphql';
import { savedFilterManager, SavedFilter } from './framework/saved-filters';
import { parseFilterFormState } from './framework/filter-form-state';
import { ColumnDefinition } from './framework/column-definition';
import { Runtime } from './framework/runtime';
import { getFilterFromUrl, clearFilterFromUrl, createShareableUrl, copyToClipboard } from './framework/filter-sharing';

export interface AppProps {
    graphqlHost: string;
    graphqlToken: string;
    geminiApiKey: string;
    viewsJson: string; // JSON string containing array of view definitions
    showViewsMenu: boolean;
    rowsPerPage?: number;
    showViewTitle: boolean; // Option to show/hide view title
    externalRuntime?: Runtime; // Optional external runtime that takes precedence over built-in runtimes
}

const builtInRuntime: Runtime = nativeRuntime

function App({ graphqlHost, graphqlToken, geminiApiKey, showViewsMenu, rowsPerPage = 20, showViewTitle, viewsJson, externalRuntime }: AppProps) {
    const views = useMemo(() => {
        const viewDefinitions = JSON.parse(viewsJson);
        return viewDefinitions.map((view: unknown) => parseViewJson(view, builtInRuntime, externalRuntime));
    }, [viewsJson, externalRuntime]) as View[];

    const client = useMemo(() => new GraphQLClient(graphqlHost, {
        headers: {
            contentType: 'application/json',
            Authorization: `Bearer ${graphqlToken}`
        },
    }), [graphqlHost, graphqlToken]);

    const {
        state,
        selectedView,
        setSelectedViewIndex,
        setFilterSchema,
        setFilterState,
        setDataRows
    } = useAppState(views);

    // Memoized GraphQL query generation for the selected view
    const memoizedQuery = useMemo(() => {
        return generateGraphQLQuery(
            selectedView.collectionName,
            selectedView.columnDefinitions as ColumnDefinition[],
            selectedView.boolExpType,
            selectedView.orderByType
        );
    }, [selectedView.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [search, setSearch] = useState('');
    const toast = useRef<Toast>(null);
    const [showAIAssistantForm, setShowAIAssistantForm] = useState(false);
    const [showFilterForm, setShowFilterForm] = useState(false);
    const [showSavedFilterList, setShowSavedFilterList] = useState(false);
    const [refetchTrigger, setRefetchTrigger] = useState(0);

    // Pagination state
    const hasNextPage = state.data.rows.length === rowsPerPage;
    const hasPrevPage = state.pagination.page > 0;

    // Load saved filters from localStorage on mount
    useEffect(() => {
        const filters = savedFilterManager.loadSavedFilters(selectedView.id);
        setSavedFilters(filters.map(filter => ({
            ...filter,
            state: parseFilterFormState(filter.state, selectedView.filterSchema)
        })));
    }, [selectedView.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load filter from URL parameter on mount and view change
    useEffect(() => {
        const urlFilterState = getFilterFromUrl();
        if (urlFilterState) {
            try {
                // Parse the URL filter state with the current view's schema
                const parsedState = parseFilterFormState(urlFilterState, selectedView.filterSchema);

                setFilterState(parsedState);
                setRefetchTrigger(prev => prev + 1);

                // Clear the filter parameter from URL to keep URL clean
                clearFilterFromUrl();

                toast.current?.show({
                    severity: 'info',
                    summary: 'Filter Loaded',
                    detail: 'Filter has been loaded from the shared URL',
                    life: 3000
                });
            } catch (error) {
                console.error('Failed to load filter from URL:', error);
                toast.current?.show({
                    severity: 'warn',
                    summary: 'Invalid Filter',
                    detail: 'The shared filter link is invalid or corrupted',
                    life: 3000
                });
            }
        }
    }, [selectedView.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Save a new filter
    const handleSaveFilter = (state: FilterFormState[]) => {
        const name = prompt('Enter a name for this filter:');
        if (!name) return;

        const savedFilter = savedFilterManager.saveFilter({
            view: selectedView.id,
            name,
            state: savedFilterManager.serializeFilterState(state)
        });

        // Update local state
        setSavedFilters(prev => [...prev, {
            ...savedFilter,
            state: state // Keep the parsed state for immediate use
        }]);

        // Show success toast
        toast.current?.show({
            severity: 'success',
            summary: 'Filter Saved',
            detail: `Filter "${name}" has been saved successfully`,
            life: 3000
        });
    };

    // Update an existing filter
    const handleUpdateFilter = (filter: SavedFilter, state: FilterFormState[]) => {
        confirmDialog({
            message: `Are you sure you want to overwrite the existing filter "${filter.name}"?`,
            header: 'Confirm Filter Update',
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'reject',
            acceptClassName: 'p-button-danger',
            accept: () => {
                const updatedFilter = savedFilterManager.updateFilter(filter, {
                    state: savedFilterManager.serializeFilterState(state)
                });

                if (updatedFilter) {
                    // Update local state
                    setSavedFilters(prev => prev.map(f =>
                        f.id === filter.id
                            ? { ...updatedFilter, state: state } // Keep the parsed state for immediate use
                            : f
                    ));

                    // Show success toast
                    toast.current?.show({
                        severity: 'success',
                        summary: 'Filter Updated',
                        detail: `Filter "${filter.name}" has been updated successfully`,
                        life: 3000
                    });
                }
            },
            reject: () => {
                // User cancelled - no action needed
            }
        });
    };

    // Delete a saved filter
    const handleDeleteFilter = (filterId: string) => {
        const success = savedFilterManager.deleteFilter(filterId);
        if (success) {
            // Update local state
            setSavedFilters(prev => prev.filter(f => f.id !== filterId));

            // Show success toast
            toast.current?.show({
                severity: 'success',
                summary: 'Filter Deleted',
                detail: 'Filter has been deleted successfully',
                life: 3000
            });
        }
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
    const handleShareSavedFilter = async (filterState: FilterFormState[]) => {
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

    const fetchDataWrapper = useCallback((cursor: string | number | null): Promise<FetchDataResult> => {
        return fetchData({
            client,
            view: selectedView,
            query: memoizedQuery,
            filterState: state.filterState,
            rows: rowsPerPage,
            cursor
        });
    }, [client, selectedView, memoizedQuery, state.filterState, rowsPerPage]);

    // Fetch data when view changes or refetch is triggered
    useEffect(() => {
        fetchDataWrapper(null)
            .then(dataRows => setDataRows(dataRows))
            .catch(error => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    // Request was aborted, no action needed
                    return;
                }
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedViewIndex, refetchTrigger]);

    // When view changes, reset filter state and clear data
    const handleViewChange = (viewIndex: number) => {
        setSelectedViewIndex(viewIndex);
        // Update URL with the new view's id
        const newViewName = views[viewIndex].id;
        window.history.pushState({}, '', `?view=${newViewName}`);
    };

    // When filter is loaded, set filter state
    const handleFilterLoad = (filterState: FilterFormState[]) => {
        setFilterState(filterState);
    };

    // Filter filterSchema by search, get indices
    const visibleIndices: number[] = state.filterSchema.filters
        .flatMap((filter: FilterFieldSchemaFilter, index: number) => {
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

            if (stringMatchesSearchQuery(filter.label)) return [index];
            const fieldFilterExprs = getFieldNodes(filter.expression);
            return fieldFilterExprs.some(expr => fieldMatchesSearchQuery(expr.field)) ? [index] : []
        });

    // Next page handler
    const handleNextPage = async () => {
        const cursor = state.data.rows.length > 0 ? state.data.rows[state.data.rows.length - 1][selectedView.paginationKey] : null
        if (typeof cursor !== 'string' && typeof cursor !== 'number') {
            console.error('Invalid cursor type:', cursor);
            return;
        }
        const newData = await fetchDataWrapper(cursor);
        setDataRows(
            newData,
            { page: state.pagination.page + 1, cursors: [...state.pagination.cursors, cursor] }
        );
    };

    // Previous page handler
    const handlePrevPage = async () => {
        if (state.pagination.page === 0) return;
        const prevCursors = state.pagination.cursors.slice(0, -1)
        const prevCursor = prevCursors[prevCursors.length - 1] ?? null;
        const newData = await fetchDataWrapper(prevCursor)
        setDataRows(
            newData,
            { page: state.pagination.page - 1, cursors: prevCursors }
        );
    };

    return (
        <div className='p-2'>
            <Toast ref={toast} />
            <ConfirmDialog />
            <Menubar
                model={[
                    ...(showViewsMenu ? [{
                        label: 'Views',
                        icon: 'pi pi-eye',
                        items: views.map((view: View, viewIndex: number) => ({
                            label: view.title,
                            icon: 'pi pi-table',
                            command: () => handleViewChange(viewIndex)
                        }))
                    }] : [])
                ]}
                className="mb-4 border-b"
                start={
                    <div className="flex gap-2 items-center">
                        <Button
                            type="button"
                            icon={showFilterForm ? 'pi pi-filter-slash' : 'pi pi-filter'}
                            outlined
                            size='small'
                            label={showFilterForm ? 'Hide Filters' : 'Filters'}
                            onClick={() => setShowFilterForm(v => !v)}
                        />
                        <Button
                            type="button"
                            icon='pi pi-bookmark'
                            outlined
                            size='small'
                            label={showSavedFilterList ? 'Hide Saved Filters' : 'Saved Filters'}
                            onClick={() => setShowSavedFilterList(v => !v)}
                        />
                    </div>
                }
                end={
                    <div className="flex gap-2">
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
                showViewTitle && (
                    <h1 className="text-2xl mb-4 font-bold">{selectedView.title}</h1>
                )
            }

            {
                showAIAssistantForm && (
                    <div className="mb-6">
                        <AIAssistantForm
                            filterSchema={state.filterSchema}
                            filterState={state.filterState}
                            setFilterSchema={setFilterSchema}
                            setFilterState={setFilterState}
                            selectedView={selectedView}
                            geminiApiKey={geminiApiKey}
                            toast={toast}
                        />
                    </div>
                )
            }

            <SavedFilterList
                savedFilters={savedFilters}
                onFilterDelete={handleDeleteFilter}
                onFilterLoad={handleFilterLoad}
                onFilterApply={() => setRefetchTrigger(prev => prev + 1)}
                onFilterShare={handleShareSavedFilter}
                visible={showSavedFilterList}
            />

            {
                showFilterForm && (
                    <FilterForm
                        filterSchema={state.filterSchema}
                        formState={state.filterState}
                        setFormState={setFilterState}
                        onSaveFilter={handleSaveFilter}
                        onUpdateFilter={handleUpdateFilter}
                        onShareFilter={handleShareFilter}
                        savedFilters={savedFilters}
                        visibleIndices={visibleIndices}
                        onSubmit={() => {
                            setRefetchTrigger(prev => prev + 1);
                        }}
                    />
                )
            }
            <Table
                columns={selectedView.columnDefinitions}
                data={state.data.flattenedRows}
                noRowsComponent={selectedView.noRowsComponent}
                setFilterState={setFilterState}
                filterState={state.filterState}
                triggerRefetch={() => setRefetchTrigger(prev => prev + 1)}
            />
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
                    />
                )
            }
        </div>
    );
}

export default App;

import { useState, useEffect, useMemo, useCallback } from 'react';
import { GraphQLClient } from 'graphql-request';
import Table from './components/Table';
import { nativeRuntime } from './framework/native-runtime';
import FilterForm, { FilterFormState } from './components/FilterForm';
import { Menubar } from 'primereact/menubar';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import TablePagination from './components/TablePagination';
import AIAssistantForm from './components/AIAssistantForm';
import { fetchData, FetchDataResult } from './framework/data';
import { useAppState } from './framework/state';
import { FilterFieldSchemaFilter, getFieldNodes, FilterField } from './framework/filters';
import { parseViewJson } from './framework/view-parser';
import { View } from './framework/view';
import { generateGraphQLQuery } from './framework/graphql';
import { savedFilterManager, SavedFilter } from './framework/saved-filters';
import { ColumnDefinition } from './framework/column-definition';
import { Runtime } from './framework/runtime';

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
    }, [selectedView.uniqueName]);

    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [search, setSearch] = useState('');
    const [showAIAssistantForm, setShowAIAssistantForm] = useState(false);
    const [showFilterForm, setShowFilterForm] = useState(false);
    const [refetchTrigger, setRefetchTrigger] = useState(0);

    // Pagination state
    const hasNextPage = state.data.rows.length === rowsPerPage;
    const hasPrevPage = state.pagination.page > 0;

    // Load saved filters from localStorage on mount
    useEffect(() => {
        const filters = savedFilterManager.loadSavedFilters(selectedView.uniqueName);
        setSavedFilters(filters.map(filter => ({
            ...filter,
            state: savedFilterManager.parseFilterState(filter, selectedView.filterSchema)
        })));
    }, [selectedView.uniqueName]);

    // Save a new filter
    const handleSaveFilter = (state: FilterFormState[]) => {
        const name = prompt('Enter a name for this filter:');
        if (!name) return;

        const savedFilter = savedFilterManager.saveFilter({
            view: selectedView.uniqueName,
            name,
            state: savedFilterManager.serializeFilterState(state)
        });

        // Update local state
        setSavedFilters(prev => [...prev, {
            ...savedFilter,
            state: state // Keep the parsed state for immediate use
        }]);
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
        fetchDataWrapper(null).then(dataRows => setDataRows(dataRows));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedViewIndex, refetchTrigger]);

    // When view changes, reset filter state and clear data
    const handleViewChange = (viewIndex: number) => {
        setSelectedViewIndex(viewIndex);
        // Update URL with the new view's uniqueName
        const newViewName = views[viewIndex].uniqueName;
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
                    }] : []),
                    {
                        label: 'Saved Filters',
                        icon: 'pi pi-file-import',
                        items: savedFilters.length > 0 ? savedFilters.map((filter) => ({
                            label: filter.name,
                            icon: 'pi pi-filter',
                            command: () => handleFilterLoad(filter.state)
                        })) : [{ label: 'No saved filters', disabled: true }]
                    }
                ]}
                className="mb-4 border-b"
                start={
                    <div className="flex gap-2 items-center">
                        <Button
                            type="button"
                            icon={showFilterForm ? 'pi pi-filter-slash' : 'pi pi-filter'}
                            outlined
                            size='small'
                            label={showFilterForm ? 'Hide Filters' : 'Show Filters'}
                            onClick={() => setShowFilterForm(v => !v)}
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
                        />
                    </div>
                )
            }

            {
                showFilterForm && (
                    <FilterForm
                        filterSchema={state.filterSchema}
                        formState={state.filterState}
                        setFormState={setFilterState}
                        onSaveFilter={handleSaveFilter}
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

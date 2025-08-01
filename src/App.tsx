import { useState, useEffect, useMemo, useCallback } from 'react';
import { GraphQLClient } from 'graphql-request';
import Table from './components/Table';
import PaymentRequestView from './views/paymentRequest';
import RequestLogView from './views/requestLog';
import SimpleTestView from './views/simpleTestView';
import FilterForm, { FilterFormState, SavedFilter, filterStateFromJSON, filterStateToJSON } from './components/FilterForm';
import { Menubar } from 'primereact/menubar';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import TablePagination from './components/TablePagination';
import AIAssistantForm from './components/AIAssistantForm';
import { fetchData, FetchDataResult } from './framework/data';
import { useAppState } from './framework/state';
import { FilterFieldSchemaFilter, getKeyNodes } from './framework/filters';
import { View } from './framework/view';

interface AppProps {
    graphqlHost: string;
    graphqlToken: string;
    geminiApiKey: string;
    showViewsMenu: boolean;
    rowsPerPage?: number;
    showViewTitle: boolean; // Option to show/hide view title
    cellRendererContext?: unknown; // Context passed to all cell renderers
}

const views = [PaymentRequestView, RequestLogView, SimpleTestView] as const;

function App({ graphqlHost, graphqlToken, geminiApiKey, showViewsMenu, rowsPerPage = 20, showViewTitle, cellRendererContext }: AppProps) {

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
    } = useAppState(views as unknown as View[]);

    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [search, setSearch] = useState('');
    const [showAIAssistantForm, setShowAIAssistantForm] = useState(false);
    const [showFilterForm, setShowFilterForm] = useState(true);

    // Pagination state
    const hasNextPage = state.data.rows.length === rowsPerPage;
    const hasPrevPage = state.pagination.page > 0;

    // Load saved filters from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem('savedFilters');
            if (raw) {
                const parsed = JSON.parse(raw);
                setSavedFilters(parsed.map((p: any) => ({
                    name: p.name,
                    state: filterStateFromJSON(p.state, selectedView.filterSchema)
                })));
            } else setSavedFilters([]);
        } catch {
            setSavedFilters([]);
        }
    }, [selectedView.filterSchema]);

    // Save a new filter
    const handleSaveFilter = (state: FilterFormState[]) => {
        const name = prompt('Enter a name for this filter:');
        if (!name) return;
        const newFilter = { name, state: filterStateToJSON(state) };
        const updatedFilters = [...savedFilters, newFilter];
        localStorage.setItem('savedFilters', JSON.stringify(updatedFilters));
        setSavedFilters(updatedFilters);
    };

    const fetchDataWrapper = useCallback((cursor: string | number | null): Promise<FetchDataResult> => {
        return fetchData({
            client,
            view: selectedView,
            filterState: state.filterState,
            rows: rowsPerPage,
            cursor
        });
    }, [client, selectedView, state.filterState, rowsPerPage]);

    // Fetch data when view changes
    useEffect(() => {
        fetchDataWrapper(null).then(dataRows => setDataRows(dataRows));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedViewIndex]);

    // When view changes, reset filter state and clear data
    const handleViewChange = (viewIndex: number) => {
        setSelectedViewIndex(viewIndex);
        // Update URL with the new view's routeName
        const newViewName = views[viewIndex].routeName;
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
            if (stringMatchesSearchQuery(filter.label)) return [index];
            const keyFilterExprs = getKeyNodes(filter.expression);
            return keyFilterExprs.some(expr => stringMatchesSearchQuery(expr.key)) ? [index] : []
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
        <div className="p-4">
            <Menubar
                model={[
                    ...(showViewsMenu ? [{
                        label: 'Views',
                        icon: 'pi pi-eye',
                        items: views.map((view, viewIndex) => ({
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
            {showViewTitle && (
                <h1 className="text-2xl mb-4 font-bold">{selectedView.title}</h1>
            )}

            {showAIAssistantForm && (
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
            )}

            {showFilterForm && (
                <FilterForm
                    filterSchema={state.filterSchema}
                    formState={state.filterState}
                    setFormState={setFilterState}
                    onSaveFilter={handleSaveFilter}
                    visibleIndices={visibleIndices}
                    onSubmit={async () => {
                        const data = await fetchDataWrapper(null);
                        setDataRows(data);
                    }}
                />
            )}
            <Table
                columns={selectedView.columnDefinitions}
                data={state.data.flattenedRows}
                noRowsComponent={selectedView.noRowsComponent}
                cellRendererContext={cellRendererContext}
                setFilterState={setFilterState}
                filterState={state.filterState}
                fetchData={() => fetchDataWrapper(null).then(setDataRows)}
            />
            {state.data.rows.length > 0 && (
                <TablePagination
                    onPageChange={handleNextPage}
                    onPrevPage={handlePrevPage}
                    hasNextPage={hasNextPage}
                    hasPrevPage={hasPrevPage}
                    currentPage={state.pagination.page}
                    rowsPerPage={rowsPerPage}
                    actualRows={state.data.rows.length}
                />
            )}
        </div>
    );
}

export default App;

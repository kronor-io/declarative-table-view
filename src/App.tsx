import { useEffect, useRef, useState } from 'react';
import { GraphQLClient } from 'graphql-request';
import Table from './components/Table';
import PaymentRequestView from './views/paymentRequest';
import RequestLogView from './views/requestLog';
import SimpleTestView from './views/simpleTestView';
import { buildHasuraConditions } from './framework/graphql';
import FilterForm, { FilterFormState, buildInitialFormState, SavedFilter, filterStateFromJSON, filterStateToJSON } from './components/FilterForm';
import { Menubar } from 'primereact/menubar';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import TablePagination from './components/TablePagination';
import AIAssistantForm from './components/AIAssistantForm';

interface AppProps {
  graphqlHost: string;
  graphqlToken: string;
  geminiApiKey: string;
}

const views = [PaymentRequestView, RequestLogView, SimpleTestView];

// Pagination state type
interface PaginationState {
  page: number;
  cursors: (string | number | null)[];
}

function App({ graphqlHost, graphqlToken, geminiApiKey }: AppProps) {
  // Get initial view from URL query parameter or default to first view
  const getInitialViewIndex = () => {
    const params = new URLSearchParams(window.location.search);
    const viewName = params.get('view');
    if (viewName) {
      const index = views.findIndex(v => v.routeName === viewName);
      if (index !== -1) {
        return index;
      }
    }
    // Update URL if no view parameter or invalid viewName
    const defaultViewName = views[0].routeName;
    window.history.replaceState({}, '', `?view=${defaultViewName}`);
    return 0;
  };

  const [selectedViewIndex, setSelectedViewIndex] = useState(getInitialViewIndex());
  const selectedView = views[selectedViewIndex];
  const [data, setData] = useState<any[]>([]);
  // Filter schema state
  const [filterSchema, setFilterSchema] = useState(selectedView.filterSchema);
  const [filterState, setFilterState] = useState<FilterFormState[]>(
    filterSchema.map(f => buildInitialFormState(f.expression))
  );
  const isFirstRender = useRef(true);

  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [search, setSearch] = useState('');
  const [showAIAssistantForm, setShowAIAssistantForm] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState<PaginationState>({ page: 0, cursors: [] });
  const rows = 20;
  const hasNextPage = data.length === rows;
  const hasPrevPage = pagination.page > 0;

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

  // Fetch data function, only called on submit or view/preset change
  const fetchData = async (customFilterState?: FilterFormState[], cursor?: string | number | null, customRows?: number): Promise<any[]> => {
    try {
      let effectiveFilter: FilterFormState[];
      if (customFilterState) {
        effectiveFilter = customFilterState;
      } else {
        effectiveFilter = filterState;
      }
      let conditions = buildHasuraConditions(effectiveFilter);
      if (cursor != null) {
        const pagKey = selectedView.paginationKey;
        const pagCond = { [pagKey]: { _lt: cursor } };
        // Always wrap in _and for pagination
        conditions = { _and: [conditions, pagCond] };
      }
      const variables = {
        conditions,
        limit: customRows ?? rows,
        orderBy: [{ [selectedView.paginationKey]: 'DESC' }],
      };
      const response = await client.request(selectedView.query, variables);
      const rowsFetched = selectedView.getResponseRows(response as any);
      setData(rowsFetched);
      return rowsFetched;
    } catch (error) {
      console.error('Error fetching data:', error);
      return [];
    }
  };

  // Fetch data on first render and when view changes (with default filter values)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      fetchData();
    } else {
      // When view changes, reset filter schema and filter state and fetch data with default values
      setFilterSchema(selectedView.filterSchema);
      const initialState = selectedView.filterSchema.map(f => buildInitialFormState(f.expression));
      setFilterState(initialState);
      setData([]);
      fetchData(initialState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedViewIndex]);

  // When view changes, reset filter state and clear data
  const handleViewChange = (viewIndex: number) => {
    setSelectedViewIndex(viewIndex);
    setPagination({ page: 0, cursors: [] });
    // Update URL with the new view's routeName
    const newViewName = views[viewIndex].routeName;
    window.history.pushState({}, '', `?view=${newViewName}`);
  };

  // When filter is loaded, set filter state and fetch data
  const handleFilterLoad = (filterStateToLoad: FilterFormState[]) => {
    setFilterState(filterStateToLoad);
    setPagination({ page: 0, cursors: [] });
    setTimeout(() => fetchData(filterStateToLoad, null, rows), 0);
  };

  // Filter filterSchema by search, get indices
  const visibleIndices = filterSchema
    .map((field, i) => {
      function treeHasMatch(expr: any): boolean {
        if (field.label.toLowerCase().includes(search.toLowerCase())) return true;
        if (expr.key && expr.key.toLowerCase().includes(search.toLowerCase())) return true;
        if (expr.filters) return expr.filters.some(treeHasMatch);
        return false;
      }
      return treeHasMatch(field.expression) ? i : -1;
    })
    .filter(i => i !== -1);

  // Next page handler
  const handleNextPage = () => {
    const cursor = data.length > 0 ? data[data.length - 1][selectedView.paginationKey] : null
    fetchData(undefined, cursor, rows).then(() => {
      setPagination(prev => ({
        page: prev.page + 1,
        cursors: [...prev.cursors, cursor]
      }));
    });
  };

  // Previous page handler
  const handlePrevPage = () => {
    if (pagination.page === 0) return;
    const prevCursors = pagination.cursors.slice(0, -1)
    const prevCursor = prevCursors[prevCursors.length - 1] ?? null;
    fetchData(undefined, prevCursor, rows).then(() => {
      setPagination(prev => ({
        cursor: prevCursor,
        page: prev.page - 1,
        cursors: prevCursors
      }));
    });
  };

  const client = new GraphQLClient(graphqlHost, {
    headers: {
      contentType: 'application/json',
      Authorization: `Bearer ${graphqlToken}`
    },
  });

  return (
    <div className="p-4">
      <Menubar
        model={[
          {
            label: 'Views',
            icon: 'pi pi-eye',
            items: views.map((view, viewIndex) => ({
              label: view.title,
              icon: 'pi pi-table',
              command: () => handleViewChange(viewIndex)
            }))
          },
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
      <h1 className="text-2xl mb-4 font-bold">{selectedView.title}</h1>

      {showAIAssistantForm && (
        <div className="flex justify-center mb-6">
          <AIAssistantForm
            filterSchema={filterSchema}
            filterState={filterState}
            setFilterSchema={setFilterSchema}
            setFilterState={setFilterState}
            setPagination={setPagination}
            selectedView={selectedView}
            geminiApiKey={geminiApiKey}
          />
        </div>
      )}

      <FilterForm
        filterSchema={filterSchema}
        formState={filterState}
        setFormState={setFilterState}
        onSaveFilter={handleSaveFilter}
        visibleIndices={visibleIndices}
        onSubmit={() => {
          setPagination({ page: 0, cursors: [] });
          fetchData(undefined, null, rows);
        }}
      />
      <Table
        columns={selectedView.columnDefinitions}
        data={data}
        noDataRowsComponent={
          selectedView.noRowsComponent
            ? selectedView.noRowsComponent({ filterState, setFilterState, fetchData })
            : null
        }
      />
      {data.length > 0 && (
        <TablePagination
          onPageChange={handleNextPage}
          onPrevPage={handlePrevPage}
          hasNextPage={hasNextPage}
          hasPrevPage={hasPrevPage}
          currentPage={pagination.page}
          rowsPerPage={rows}
          actualRows={data.length}
        />
      )}
    </div>
  );
}

export default App;

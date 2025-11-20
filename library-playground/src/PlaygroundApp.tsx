import { App, RowSelectionAPI } from '@kronor/dtv';
import { installFetchMock } from './mockFetch';
import views from './views.json';
import { useRef } from 'react';
import { Button } from 'primereact/button';
import { runtime } from './runtime';

// Relative paths cause GraphQLClient to throw (it internally constructs a URL).
// Resolve to an absolute URL based on current origin to avoid "Failed to construct 'URL'" errors.
const MOCK_GRAPHQL_PATH = '/playground-graphql';
const ABSOLUTE_GRAPHQL_HOST = typeof window !== 'undefined'
    ? `${window.location.origin}${MOCK_GRAPHQL_PATH}`
    : MOCK_GRAPHQL_PATH;

// Install the fetch mock immediately at module load so the first GraphQL request
// from <App /> is intercepted.
if (typeof window !== 'undefined') {
    installFetchMock(ABSOLUTE_GRAPHQL_HOST);
}

export function PlaygroundApp() {
    const rowSelectionApiRef = useRef<RowSelectionAPI | null>(null);

    return (
        <>
            <App
                graphqlHost={ABSOLUTE_GRAPHQL_HOST}
                graphqlToken="PLAYGROUND_TOKEN"
                geminiApiKey=""
                showViewsMenu={false}
                showViewTitle={true}
                viewsJson={JSON.stringify(views)}
                syncFilterStateToUrl={false}
                externalRuntime={runtime}
                rowSelection={
                    {
                        rowSelectionType: 'multiple',
                        onRowSelectionChange: (rows: any[]) => { console.log(rows) },
                        apiRef: rowSelectionApiRef
                    }
                }
                rowClassFunction={(row: Record<string, any>) => {
                    return {
                        'p-highlight': row.amount > 200
                    };
                }}
                rowsPerPageOptions={[10, 20, 50]}
            />
            <Button onClick={() => { rowSelectionApiRef.current?.resetRowSelection(); }}>Reset Row Selection</Button>
        </>
    );
}

export default PlaygroundApp;

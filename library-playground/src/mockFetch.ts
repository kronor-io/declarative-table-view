interface SimpleTestRow {
    id: number;
    testField: string;
    amount: number;
    email: string;
}

const STATIC_ROWS: SimpleTestRow[] = [
    { id: 1, testField: 'Alpha', amount: 120, email: 'alpha@example.com' },
    { id: 2, testField: 'Beta', amount: 210, email: 'beta@example.com' },
    { id: 3, testField: 'Gamma', amount: 260, email: 'gamma@example.com' },
    { id: 4, testField: 'Delta', amount: 180, email: 'delta@example.com' },
    { id: 5, testField: 'Epsilon', amount: 300, email: 'epsilon@example.com' }
];

function applyConditions(rows: SimpleTestRow[], body: any): SimpleTestRow[] {
    try {
        const vars = body.variables || {};
        const condRoot = vars.conditions || {};
        const eqValues: Record<string, any> = {};
        function extractEq(obj: any) {
            if (!obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
                if (key === '_and' && Array.isArray(obj[key])) obj[key].forEach(extractEq);
                else if (obj[key] && typeof obj[key] === 'object' && '_eq' in obj[key]) {
                    eqValues[key] = obj[key]['_eq'];
                }
            }
        }
        extractEq(condRoot);
        return rows.filter(r => Object.entries(eqValues).every(([field, value]) => (r as any)[field] === value));
    } catch {
        return rows;
    }
}

export function installFetchMock(graphqlHost: string) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        // Support both relative and fully-qualified URLs produced by graphql-request
        const matchesGraphql = url === graphqlHost || url.endsWith(graphqlHost);
        if (matchesGraphql) {
            try {
                const text = init?.body ? String(init.body) : '{}';
                const body = JSON.parse(text);
                const pageRows = applyConditions(STATIC_ROWS, body).slice(0, body.variables?.rowLimit || 20);
                // Basic pagination condition support: if paginationCondition contains _lt, apply it.
                const paginationCond = body.variables?.paginationCondition || {};
                const ltEntry = paginationCond && Object.entries(paginationCond)[0];
                if (ltEntry) {
                    const [field, cond] = ltEntry;
                    if (cond && typeof cond === 'object' && '_lt' in cond) {
                        const cursor = (cond as any)._lt;
                        // Emulate Hasura _lt filtering
                        const filtered = pageRows.filter(r => (r as any)[field] < cursor);
                        return new Response(JSON.stringify({ data: { simpleTestDataCollection: filtered } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }
                }
                return new Response(JSON.stringify({ data: { simpleTestDataCollection: pageRows } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                return new Response(JSON.stringify({ errors: [{ message: 'Mock parse error', detail: String(e) }] }), { status: 500 });
            }
        }
        return originalFetch(input as any, init);
    };
}

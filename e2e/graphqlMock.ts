// Shared GraphQL mock handler for e2e tests (pagination and simple view)
import { Route } from '@playwright/test';

// Fixed dataset: 30 items (1.5 pages at 20 per page)
const allRows = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    testField: `Test ${i + 1}`,
    amount: (i + 1) * 10
}));

export async function mockPaginationGraphQL(route: Route) {
    const request = route.request();
    const postData = request.postDataJSON?.();
    // Use paginationKey (id._gt or id._lt) to determine the start index, depending on orderBy
    let startIdx = 0;
    let pageSize = 20;
    let orderKey = 'id';
    let orderDir = 'asc';
    if (postData && postData.variables && typeof postData.variables.limit === 'number') {
        pageSize = postData.variables.limit;
    }
    if (postData && postData.variables && Array.isArray(postData.variables.orderBy) && postData.variables.orderBy.length > 0) {
        const order = postData.variables.orderBy[0];
        orderKey = Object.keys(order)[0];
        orderDir = order[orderKey];
    }
    // Sort allRows according to orderBy
    let sortedRows = allRows.slice();
    sortedRows.sort((a, b) => {
        if (a[orderKey] < b[orderKey]) return orderDir === 'ASC' ? -1 : 1;
        if (a[orderKey] > b[orderKey]) return orderDir === 'ASC' ? 1 : -1;
        return 0;
    });
    // Helper to recursively extract _gt/_lt for the pagination key from a condition tree
    function findPaginationCursor(cond: any, key: string, orderDir: string): number | undefined {
        if (!cond) return undefined;
        if (cond._and && Array.isArray(cond._and)) {
            for (const sub of cond._and) {
                const found = findPaginationCursor(sub, key, orderDir);
                if (found !== undefined) return found;
            }
        }
        if (cond._or && Array.isArray(cond._or)) {
            for (const sub of cond._or) {
                const found = findPaginationCursor(sub, key, orderDir);
                if (found !== undefined) return found;
            }
        }
        if (cond[key]) {
            if (orderDir === 'ASC' && cond[key]._gt !== undefined) return Number(cond[key]._gt);
            if (orderDir === 'DESC' && cond[key]._lt !== undefined) return Number(cond[key]._lt);
        }
        return undefined;
    }
    // Apply additional filters (e.g. by amount)
    function applyFilters(rows: typeof allRows, conditions: any): typeof allRows {
        if (!conditions) return rows;
        // Only handle simple _gte/_lte/_eq for 'amount' and 'id' for now
        return rows.filter(row => {
            let pass = true;
            if (conditions.amount) {
                if (conditions.amount._gte !== undefined) pass = pass && row.amount >= conditions.amount._gte;
                if (conditions.amount._lte !== undefined) pass = pass && row.amount <= conditions.amount._lte;
                if (conditions.amount._eq !== undefined) pass = pass && row.amount === conditions.amount._eq;
            }
            if (conditions.id) {
                if (conditions.id._gte !== undefined) pass = pass && row.id >= conditions.id._gte;
                if (conditions.id._lte !== undefined) pass = pass && row.id <= conditions.id._lte;
                if (conditions.id._eq !== undefined) pass = pass && row.id === conditions.id._eq;
            }
            return pass;
        });
    }
    // Pagination: use _gt for asc, _lt for desc, recursively
    let cursorValue: number | undefined = undefined;
    let filteredRows = sortedRows;
    if (postData && postData.variables && postData.variables.conditions) {
        // Apply filters first
        filteredRows = applyFilters(sortedRows, postData.variables.conditions);
        // Then pagination cursor
        cursorValue = findPaginationCursor(postData.variables.conditions, orderKey, orderDir);
        if (cursorValue !== undefined) {
            const idx = filteredRows.findIndex(r => Number(r[orderKey]) === cursorValue);
            startIdx = idx >= 0 ? idx + 1 : 0;
        }
    }

    const data = filteredRows.slice(startIdx, startIdx + pageSize);
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            data: {
                simpleTestDataCollection: data
            }
        })
    });
}

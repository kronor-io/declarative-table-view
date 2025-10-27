// Shared GraphQL mock handler for e2e tests (pagination and simple view)
import { Route } from '@playwright/test';

// Fixed dataset: 30 items (1.5 pages at 20 per page)
const allRows = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    testField: `Test ${i + 1}`,
    amount: (i + 1) * 10,
    email: `user${i + 1}@example.com`,
    phone: `+467000000${(i + 1).toString().padStart(2, '0')}`
}));

export async function mockPaginationGraphQL(route: Route) {
    const request = route.request();
    const postData = request.postDataJSON?.();
    // Use paginationKey (id._gt or id._lt) to determine the start index, depending on orderBy
    let startIdx = 0;
    let pageSize = 20;
    type Row = typeof allRows[number];
    let orderKey: keyof Row = 'id';
    let orderDir = 'asc';
    if (postData && postData.variables && typeof postData.variables.rowLimit === 'number') {
        pageSize = postData.variables.rowLimit;
    }
    if (postData && postData.variables && Array.isArray(postData.variables.orderBy) && postData.variables.orderBy.length > 0) {
        const order = postData.variables.orderBy[0];
        const key = Object.keys(order)[0] as keyof Row;
        orderKey = key;
        orderDir = (order as any)[orderKey];
    }
    // Sort allRows according to orderBy
    const sortedRows = allRows.slice();
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
    // Apply additional filters (e.g. by amount, email)
    function applyFilters(rows: typeof allRows, conditions: any): typeof allRows {
        if (!conditions) return rows;

        return rows.filter(row => evaluateCondition(row, conditions));
    }

    // Recursively evaluate a condition against a row
    function evaluateCondition(row: any, condition: any): boolean {
        // Handle logical operators
        if (condition._and) {
            return condition._and.every((subCondition: any) => evaluateCondition(row, subCondition));
        }
        if (condition._or) {
            return condition._or.some((subCondition: any) => evaluateCondition(row, subCondition));
        }
        if (condition._not) {
            return !evaluateCondition(row, condition._not);
        }

        // Handle field conditions
        let pass = true;

        // Check each field in the condition
        for (const [fieldName, fieldCondition] of Object.entries(condition)) {
            if (fieldName.startsWith('_')) continue; // Skip logical operators

            const fieldValue = row[fieldName];
            const ops = fieldCondition as any;

            if (ops._eq !== undefined) {
                if (fieldName === 'transformedField') {
                    // Special handling for transformedField - convert back to testField
                    const expectedValue = ops._eq.replace('prefix_', 'Test ');
                    pass = pass && row.testField === expectedValue;
                } else {
                    pass = pass && fieldValue === ops._eq;
                }
            }
            if (ops._neq !== undefined) pass = pass && fieldValue !== ops._neq;
            if (ops._gt !== undefined) pass = pass && fieldValue > ops._gt;
            if (ops._lt !== undefined) pass = pass && fieldValue < ops._lt;
            if (ops._gte !== undefined) pass = pass && fieldValue >= ops._gte;
            if (ops._lte !== undefined) pass = pass && fieldValue <= ops._lte;
            if (ops._in !== undefined) pass = pass && Array.isArray(ops._in) && ops._in.includes(fieldValue);
            if (ops._nin !== undefined) pass = pass && (!Array.isArray(ops._nin) || !ops._nin.includes(fieldValue));
            if (ops._like !== undefined) {
                // Convert SQL LIKE pattern to regex
                const pattern = ops._like.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
                const regex = new RegExp(`^${pattern}$`);
                pass = pass && regex.test(String(fieldValue));
            }
            if (ops._ilike !== undefined) {
                // Convert SQL ILIKE pattern to case-insensitive regex
                const pattern = ops._ilike.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
                const regex = new RegExp(`^${pattern}$`, 'i');
                pass = pass && regex.test(String(fieldValue));
            }
            if (ops._is_null !== undefined) pass = pass && ((fieldValue == null) === ops._is_null);
        }

        return pass;
    }
    // Pagination: use _gt for asc, _lt for desc, recursively
    let cursorValue: number | undefined = undefined;
    let filteredRows = sortedRows;
    if (postData && postData.variables) {
        const { conditions, paginationCondition } = postData.variables;

        // Apply only the base conditions (user/static filters) for filtering
        if (conditions) {
            filteredRows = applyFilters(sortedRows, conditions);
        }

        // Cursor now lives in a separate variable (paginationCondition) after refactor.
        // Fallback to legacy location (conditions) if needed for backward compatibility.
        const cursorSource = paginationCondition && Object.keys(paginationCondition).length > 0
            ? paginationCondition
            : conditions;

        if (cursorSource) {
            cursorValue = findPaginationCursor(cursorSource, orderKey, orderDir);
            if (cursorValue !== undefined) {
                const idx = filteredRows.findIndex(r => Number((r as any)[orderKey]) === cursorValue);
                startIdx = idx >= 0 ? idx + 1 : 0;
            }
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

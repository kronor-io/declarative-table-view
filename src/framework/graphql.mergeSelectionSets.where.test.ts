import { generateSelectionSetFromColumns, hasuraFilterExpressionsAreEqual, Hasura } from './graphql';
import type { ColumnDefinition } from './column-definition';
import { arrayQuery } from '../dsl/columns';

const condA = Hasura.condition('status', Hasura.eq('ACTIVE'));
const condB = Hasura.condition('priority', Hasura.gt(5));

describe('mergeSelectionSets where dedupe behavior', () => {
    it('keeps distinct where clauses as separate entries', () => {
        const columns: ColumnDefinition[] = [
            { type: 'virtualColumn', id: 'tasks-a', data: [arrayQuery({ field: 'tasks', selectionSet: [], where: condA })] },
            { type: 'virtualColumn', id: 'tasks-b', data: [arrayQuery({ field: 'tasks', selectionSet: [], where: condB })] }
        ];
        const selection = generateSelectionSetFromColumns(columns);
        const tasks = selection.filter(s => s.field === 'tasks');
        expect(tasks.length).toBe(2);
        const hasA = tasks.some(t => t.where && hasuraFilterExpressionsAreEqual(t.where, condA));
        const hasB = tasks.some(t => t.where && hasuraFilterExpressionsAreEqual(t.where, condB));
        expect(hasA).toBe(true);
        expect(hasB).toBe(true);
    });

    it('deduplicates identical where clauses', () => {
        const columns: ColumnDefinition[] = [
            { type: 'virtualColumn', id: 'tasks-a', data: [arrayQuery({ field: 'tasks', selectionSet: [], where: condA })] },
            { type: 'virtualColumn', id: 'tasks-a-dup', data: [arrayQuery({ field: 'tasks', selectionSet: [], where: condA })] }
        ];
        const selection = generateSelectionSetFromColumns(columns);
        const tasks = selection.filter(s => s.field === 'tasks');
        expect(tasks.length).toBe(1);
        expect(tasks[0].where && hasuraFilterExpressionsAreEqual(tasks[0].where, condA)).toBe(true);
    });
});

import { generateSelectionSetFromColumns, hasuraConditionsAreEqual } from './graphql';
import type { ColumnDefinition } from './column-definition';
import { arrayQuery } from '../dsl/columns';

// Helper HasuraCondition samples
const condA = { status: { _eq: 'ACTIVE' } } as any;
const condB = { priority: { _gt: 5 } } as any;

describe('mergeSelectionSets where dedupe behavior', () => {
    it('keeps distinct where clauses as separate entries', () => {
        const columns: ColumnDefinition[] = [
            { type: 'virtualColumn', id: 'tasks-a', data: [arrayQuery('tasks', [], { where: condA })] },
            { type: 'virtualColumn', id: 'tasks-b', data: [arrayQuery('tasks', [], { where: condB })] }
        ];
        const selection = generateSelectionSetFromColumns(columns);
        const tasks = selection.filter(s => s.field === 'tasks');
        expect(tasks.length).toBe(2);
        const hasA = tasks.some(t => hasuraConditionsAreEqual(t.where as any, condA));
        const hasB = tasks.some(t => hasuraConditionsAreEqual(t.where as any, condB));
        expect(hasA).toBe(true);
        expect(hasB).toBe(true);
    });

    it('deduplicates identical where clauses', () => {
        const columns: ColumnDefinition[] = [
            { type: 'virtualColumn', id: 'tasks-a', data: [arrayQuery('tasks', [], { where: condA })] },
            { type: 'virtualColumn', id: 'tasks-a-dup', data: [arrayQuery('tasks', [], { where: condA })] }
        ];
        const selection = generateSelectionSetFromColumns(columns);
        const tasks = selection.filter(s => s.field === 'tasks');
        expect(tasks.length).toBe(1);
        expect(hasuraConditionsAreEqual(tasks[0].where as any, condA)).toBe(true);
    });
});

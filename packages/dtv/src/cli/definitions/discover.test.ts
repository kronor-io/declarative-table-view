/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverViews, scanViewModules, type DiscoveredExport } from './discover';

// A project of its own: `./dtv` stands in for @kronor/dtv.
const files: Record<string, string> = {
    'dtv.ts': `
        export type View = { id: string; title: string };
        export const DSL = { view: (view: View): View => view };
    `,
    'journal.ts': `
        import { DSL, type View } from './dtv';
        type Option = { id: number; name: string };
        export const journalView = (args: {
            currencies: readonly Option[];
            mode: 'list' | 'dialog';
            hideRowExpansion?: boolean;
            onEdit?: (id: number) => void;
        }): View => DSL.view({ id: 'journal', title: args.mode });
        export const notAView = (count: number) => count;
    `,
    'constant.ts': `
        import { DSL } from './dtv';
        export const countries = DSL.view({ id: 'countries', title: 'Countries' });
    `,
    'positional.ts': `
        import { DSL, type View } from './dtv';
        export function historyView(entityLog: string, entityId?: number): View {
            return DSL.view({ id: \`\${entityLog}-history\`, title: String(entityId) });
        }
    `,
    'inline.ts': `
        import { DSL } from './dtv';
        export function Component() {
            const view = DSL.view({ id: 'inline', title: 'Inline' });
            return view.title;
        }
    `,
    'unrelated.ts': `
        export const nothing = 1;
    `
};

describe('discovering view definitions', () => {
    let cwd: string;
    let found: { exports: DiscoveredExport[]; unreachable: string[] };

    beforeAll(async () => {
        cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dtv-discover-'));
        for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(cwd, name), text);
        const modules = await scanViewModules(cwd, ['**/*.ts'], [], './dtv');
        expect(modules.map(file => path.basename(file))).toEqual(['constant.ts', 'inline.ts', 'journal.ts', 'positional.ts']);
        found = discoverViews(cwd, modules);
    });

    afterAll(async () => {
        await fs.rm(cwd, { recursive: true, force: true });
    });

    const byName = (name: string) => found.exports.find(exported => exported.exportName === name);

    it('finds the exports that are views or return one', () => {
        expect(found.exports.map(exported => [exported.kind, exported.exportName]).sort()).toEqual([
            ['constant', 'countries'],
            ['factory', 'historyView'],
            ['factory', 'journalView']
        ]);
    });

    it('reports modules that build a view no export gives', () => {
        expect(found.unreachable.map(file => path.basename(file))).toEqual(['inline.ts']);
    });

    it('makes minimal and contrasting arguments up from the parameter types', () => {
        const journal = byName('journalView');
        if (journal?.kind !== 'factory') throw new Error('journalView is not a factory');

        expect(journal.args.minimal()).toEqual([{ currencies: [], mode: 'list' }]);
        const [contrasting] = journal.args.contrasting() as [Record<string, unknown>];
        expect(contrasting).toMatchObject({ currencies: [{ id: 1, name: 'x1' }], mode: 'dialog', hideRowExpansion: true });
        expect(typeof contrasting.onEdit).toBe('function');
    });

    it('leaves optional parameters out of the minimal arguments only', () => {
        const history = byName('historyView');
        if (history?.kind !== 'factory') throw new Error('historyView is not a factory');

        expect(history.args.minimal()).toEqual(['', undefined]);
        expect(history.args.contrasting()).toEqual(['x1', 1]);
    });
});

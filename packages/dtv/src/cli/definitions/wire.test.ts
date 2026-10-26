/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { renameMigrationsImport, wireMigrations } from './wire';

const wire = (text: string, definition = 'journal-list') =>
    wireMigrations(text, '/p/journalListDtv.tsx', definition, './dtv-migrations/journal-list', '@kronor/dtv');

describe('wiring a view up with its migrations', () => {
    it('adds the import and the property after the id, in the module\'s style', () => {
        const text = [
            "import { DSL as DTV, type View } from '@kronor/dtv';",
            "import Filter from '@/common/dtv/filters';",
            '',
            'export const journalListDtvView = (): View => DTV.view({',
            "    id: 'journal-list',",
            "    title: 'Journals',",
            '});',
            ''
        ].join('\n');

        expect(wire(text)).toEqual({
            kind: 'wired',
            text: [
                "import { DSL as DTV, type View } from '@kronor/dtv';",
                "import Filter from '@/common/dtv/filters';",
                "import journalListMigrations from './dtv-migrations/journal-list';",
                '',
                'export const journalListDtvView = (): View => DTV.view({',
                "    id: 'journal-list',",
                '    migrations: journalListMigrations,',
                "    title: 'Journals',",
                '});',
                ''
            ].join('\n')
        });
    });

    it('follows double quotes and no semicolons, and an id that is the last property', () => {
        const text = 'import { DSL } from "@kronor/dtv"\n\nexport const view = DSL.view({ title: "T", id: "journal-list" })\n';

        expect(wire(text)).toEqual({
            kind: 'wired',
            text: 'import { DSL } from "@kronor/dtv"\nimport journalListMigrations from "./dtv-migrations/journal-list"\n\n' +
                'export const view = DSL.view({ title: "T", id: "journal-list",\nmigrations: journalListMigrations })\n'
        });
    });

    it('takes the module\'s only DSL.view call when its id is computed', () => {
        const text = [
            "import { DSL } from '@kronor/dtv';",
            'export const history = (log: string) => DSL.view({',
            '    id: `${log}-history-list`,',
            '});'
        ].join('\n');

        const wired = wire(text, 'history-list');
        expect(wired.kind === 'wired' && wired.text).toContain('    id: `${log}-history-list`,\n    migrations: historyListMigrations,\n});');
    });

    it('picks the call by its id among several, and gives up when none has it', () => {
        const text = [
            "import * as Dtv from '@kronor/dtv';",
            "export const a = Dtv.DSL.view({ id: 'a' });",
            "export const b = Dtv.DSL.view({ id: 'journal-list' });"
        ].join('\n');

        const wired = wire(text);
        expect(wired.kind === 'wired' && wired.text).toContain("Dtv.DSL.view({ id: 'journal-list',\nmigrations: journalListMigrations });");
        expect(wire(text, 'other')).toEqual({ kind: 'unwirable', reason: "several DSL.view calls in it, none with the id 'other'" });
    });

    it('leaves a call alone that has migrations already, and picks a name the module does not use', () => {
        const wired = "import { DSL } from '@kronor/dtv';\nexport const v = DSL.view({ id: 'journal-list', migrations: m });";
        expect(wire(wired)).toEqual({ kind: 'unwirable', reason: 'its DSL.view call has migrations already' });

        const taken = "import { DSL } from '@kronor/dtv';\nconst journalListMigrations = 1;\nexport const v = DSL.view({ id: 'journal-list' });";
        const result = wire(taken);
        expect(result.kind === 'wired' && result.text).toContain('import journalListMigrations2 from');
    });
});

describe('renaming the import of a migrations folder', () => {
    it('points imports of the old folder at the new one', () => {
        const text = "import a from './dtv-migrations/payments';\nimport b from \"../x/dtv-migrations/payments/index\";\nimport c from './dtv-migrations/payments-other';";

        expect(renameMigrationsImport(text, 'payments', 'payment-list')).toBe(
            "import a from './dtv-migrations/payment-list';\nimport b from \"../x/dtv-migrations/payment-list/index\";\nimport c from './dtv-migrations/payments-other';"
        );
        expect(renameMigrationsImport("import a from './x';", 'payments', 'payment-list')).toBeNull();
    });
});

/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { generateOps, renderIndex, renderMigration, renderSnapshot, toLiteral } from './generate';
import type { FilterProjection, ViewProjection } from './types';

const text = (field: string): FilterProjection => ({ kind: 'leaf', cmp: 'equals', field, control: { type: 'text' } });
const operators = (...ops: string[]): FilterProjection => ({
    kind: 'leaf',
    cmp: 'equals',
    field: 'reference',
    control: { type: 'customOperator', operators: ops, valueControl: { type: 'text' } }
});
const range = (parts: number): FilterProjection => ({
    kind: 'and',
    children: Array.from({ length: parts }, () => ({ kind: 'leaf', cmp: 'equals', field: 'createdAt', control: { type: 'date' } }))
});

const projection = (revision: number, filters: ViewProjection['filters'], columns: ViewProjection['columns'] = {}): ViewProjection =>
    ({ definition: 'payments', revision, filters, columns });

const codes = (from: ViewProjection, to: ViewProjection) => generateOps(from, to).map(op => op.code);

describe('generateOps', () => {
    it('writes nothing for additions', () => {
        expect(codes(projection(1, { a: text('a') }), projection(2, { a: text('a'), b: text('b') }, { id: { orderBy: 'id' } }))).toEqual([]);
    });

    it('drops removed filters and columns that nothing could have been renamed to', () => {
        expect(codes(projection(1, { legacy: text('legacy') }, { old: { orderBy: null } }), projection(2, {}))).toEqual([
            "m.drop('legacy')",
            "m.dropColumn('old')"
        ]);
    });

    it('renames a filter removed when one added has the same definition', () => {
        const [op] = generateOps(projection(1, { amt: text('amount') }), projection(2, { amount: text('amount') }));
        expect(op).toEqual({
            code: "m.renameFilter('amt', 'amount')",
            comments: [
                '"amt" was removed and "amount" added, with the same definition.',
                'If "amount" is another filter that only looks the same: m.drop(\'amt\')'
            ],
            todo: false
        });
    });

    it('leaves a rename open when several filters have the same definition', () => {
        const oneToTwo = generateOps(projection(1, { amt: text('amount') }), projection(2, { amount: text('amount'), total: text('amount') }));
        expect(oneToTwo.map(op => op.code)).toEqual(["m.todo('amt', 'renamed to \"amount\" or \"total\"?')"]);

        const twoToOne = generateOps(projection(1, { amt: text('amount'), sum: text('amount') }), projection(2, { amount: text('amount') }));
        // Either may have become "amount": both are asked about, neither is dropped unasked.
        expect(twoToOne.map(op => op.code)).toEqual(["m.todo('amt', 'renamed to \"amount\"?')", "m.todo('sum', 'renamed to \"amount\"?')"]);
    });

    it('asks about a removed filter that may live on, renamed and changed, in an added one', () => {
        const [op] = generateOps(projection(1, { amt: text('amount') }), projection(2, { amount: text('amountMinor'), range: range(2) }));
        expect(op.code).toBe("m.todo('amt', 'renamed to \"amount\", and changed?')");
        expect(op.comments).toEqual([
            '"amt" was removed, and "amount" added with a state its stored state fits.',
            "Renamed, same meaning: m.custom('amt', 'amount', state => state)",
            "Removed: m.drop('amt')"
        ]);
    });

    it('resets filters whose stored state no longer fits', () => {
        const ops = generateOps(
            projection(1, { created: range(2), status: { kind: 'leaf', cmp: 'in', field: 'status', control: { type: 'multiselect' } } }),
            projection(2, { created: range(3), status: { kind: 'leaf', cmp: 'in', field: 'status', control: { type: 'dropdown' } } })
        );
        expect(ops.map(op => [op.code, op.comments[0]])).toEqual([
            ["m.reset('created')", 'Stored state of "created" no longer fits: it has 3 parts instead of 2.'],
            ["m.reset('status')", 'Stored state of "status" no longer fits: its control changed from multiselect to dropdown.']
        ]);
    });

    it('asks whether a filter on another field still means the same', () => {
        const [op] = generateOps(projection(1, { amount: text('amount') }), projection(2, { amount: text('amountMinor') }));
        expect(op.todo).toBe(true);
        expect(op.code).toBe("m.todo('amount', 'its field changed from \"amount\" to \"amountMinor\"; does what is stored still mean the same?')");
        expect(op.comments).toContain("Same meaning: m.keep('amount', { because: '…' })");
    });

    it('covers added operators, and asks where removed ones go', () => {
        expect(codes(projection(1, { reference: operators('_eq') }), projection(2, { reference: operators('_eq', '_ilike') })))
            .toEqual(["m.mapOperators('reference', {})"]);

        const [op] = generateOps(projection(1, { reference: operators('_eq', '_like') }), projection(2, { reference: operators('_eq', '_ilike') }));
        expect(op.code).toBe("m.todo('reference', 'map the operators it no longer offers: _like')");
        expect(op.comments).toEqual(["Map each to one of '_eq', '_ilike', or to null to clear it:", "m.mapOperators('reference', { '_like': … })"]);
    });

    it('resets the sort of columns that sort by another field, and asks about possibly renamed ones', () => {
        expect(codes(
            projection(1, {}, { amount: { orderBy: 'amount' }, old: { orderBy: null } }),
            projection(2, {}, { amount: { orderBy: 'amountMinor' }, renamed: { orderBy: null } })
        )).toEqual(["m.todo('old', 'renamed to \"renamed\"?')", "m.resetSort('amount')"]);
    });
});

describe('rendering', () => {
    it('writes projections as TypeScript literals', () => {
        expect(toLiteral({ a: [1, 'x'], 'not-an-identifier': { b: null }, c: [] })).toBe(
            "{\n    a: [1, 'x'],\n    'not-an-identifier': {\n        b: null\n    },\n    c: []\n}"
        );
    });

    it('writes a snapshot module', () => {
        expect(renderSnapshot(projection(2, { a: text('a') }), '@kronor/dtv')).toBe([
            '// Generated by `dtv definitions snapshot`. Do not edit: the definition "payments" at revision 2.',
            "import type { ViewProjection } from '@kronor/dtv';",
            '',
            'export const v2 = {',
            "    definition: 'payments',",
            '    revision: 2,',
            '    filters: {',
            '        a: {',
            "            kind: 'leaf',",
            "            cmp: 'equals',",
            "            field: 'a',",
            '            control: {',
            "                type: 'text'",
            '            }',
            '        }',
            '    },',
            '    columns: {}',
            '} as const satisfies ViewProjection;',
            ''
        ].join('\n'));
    });

    it('writes a migration module, flagging open decisions', () => {
        const ops = generateOps(
            projection(1, { amt: text('amount'), legacy: text('legacy'), status: text('status') }),
            projection(2, { amount: text('amount'), status: text('state') })
        );
        expect(renderMigration({ fromRevision: 1, toRevision: 2, ops, dtvImport: '@kronor/dtv' })).toBe([
            '// Generated by `dtv definitions snapshot`. Replace each m.todo(…) with the operation it asks for.',
            "import { DSL } from '@kronor/dtv';",
            "import { v1 } from './v1.snapshot';",
            "import { v2 } from './v2.snapshot';",
            '',
            'export default DSL.defineMigration(v1, v2, m => [',
            '    // "amt" was removed and "amount" added, with the same definition.',
            "    // If \"amount\" is another filter that only looks the same: m.drop('amt')",
            "    m.renameFilter('amt', 'amount'),",
            "    m.drop('legacy'),",
            '    // "status": its field changed from "status" to "state".',
            "    // Same meaning: m.keep('status', { because: '…' })",
            "    // Otherwise: m.reset('status')",
            "    m.todo('status', 'its field changed from \"status\" to \"state\"; does what is stored still mean the same?'),",
            ']);',
            ''
        ].join('\n'));
    });

    it('writes a manual revision as an open decision', () => {
        const rendered = renderMigration({ fromRevision: 2, toRevision: 3, ops: [], dtvImport: '@kronor/dtv', manualReason: 'status values are lower case now' });
        expect(rendered).toContain("    m.todo('manual revision', 'status values are lower case now'),");
    });

    it('writes an empty migration without an unused parameter', () => {
        expect(renderMigration({ fromRevision: 1, toRevision: 2, ops: [], dtvImport: '@kronor/dtv' }))
            .toContain('export default DSL.defineMigration(v1, v2, () => []);');
    });

    it('writes the folder index', () => {
        expect(renderIndex({ baselineRevision: 1, migrationRevisions: [2, 3], dtvImport: '@kronor/dtv' })).toBe([
            '// Generated by `dtv definitions snapshot`. Do not edit.',
            "import { DSL } from '@kronor/dtv';",
            "import { v1 } from './v1.snapshot';",
            "import m2 from './v2';",
            "import m3 from './v3';",
            '',
            'export default DSL.defineViewMigrations(v1, [m2, m3]);',
            ''
        ].join('\n'));
    });
});

/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { projectDefinition, resolveDefinitions, type BuiltExport } from './resolve';
import type { LoadedView, ViewProjection } from './types';

/** A stand-in view: its id, filter fields by id, and column ids. */
type FakeView = LoadedView & { filters: Record<string, string>; columns: string[] };

const view = (id: string, filters: Record<string, string> = { status: 'status' }, columns: string[] = ['id']): FakeView =>
    ({ id, filters, columns });

const project = (loaded: LoadedView, definition: string, revision = 1): ViewProjection => {
    const fake = loaded as FakeView;
    return {
        definition,
        revision,
        filters: Object.fromEntries(Object.entries(fake.filters).map(([id, field]) => [id, { kind: 'leaf', cmp: 'equals', field, control: { type: 'text' } }])),
        columns: Object.fromEntries(fake.columns.map(id => [id, { orderBy: null }]))
    };
};

const factory = (name: string, builds: BuiltExport['builds'], extra: Partial<BuiltExport> = {}): BuiltExport =>
    ({ label: `${name} (src/${name}.ts)`, configKey: name, source: `/p/src/${name}.ts`, generated: true, builds, ...extra });

describe('resolveDefinitions', () => {
    it('takes a factory whose arguments change nothing that matters by its id', () => {
        const { definitions, problems } = resolveDefinitions([factory('journalList', [{ view: view('journal-list') }, { view: view('journal-list') }])], project);

        expect(problems).toEqual([]);
        expect(Object.keys(definitions)).toEqual(['journal-list']);
        expect(definitions['journal-list'].source).toBe('/p/src/journalList.ts');
    });

    it('takes the minimal id when the arguments only add a suffix to it', () => {
        const { definitions, problems } = resolveDefinitions([
            factory('assetList', [{ view: view('asset-list') }, { view: view('asset-list-1') }]),
            factory('dispatchAdvice', [{ view: view('dispatch-advice') }, { view: view('dispatch-advice-credit') }])
        ], project);

        expect(problems).toEqual([]);
        expect(Object.keys(definitions)).toEqual(['asset-list', 'dispatch-advice']);
    });

    it('wants the definition id configured when the id is computed from the arguments', () => {
        const history = [{ view: view('-history-list') }, { view: view('x1-history-list') }];

        expect(resolveDefinitions([factory('historyView', history)], project).problems).toEqual([
            'historyView (src/historyView.ts): its view id depends on its arguments (-history-list, x1-history-list); configure its definition id in definitions.factories["historyView"]'
        ]);

        const configured = resolveDefinitions([factory('historyView', history, { definition: 'history-list' })], project);
        expect(configured.problems).toEqual([]);
        expect(Object.keys(configured.definitions)).toEqual(['history-list']);
    });

    it('wants the args configured when the arguments change the filters', () => {
        const { problems } = resolveDefinitions([
            factory('modal', [{ view: view('modal', { status: 'status' }) }, { view: view('modal', { status: 'state', extra: 'x' }) }])
        ], project);

        expect(problems).toEqual(['modal (src/modal.ts): its arguments change its filters (status, extra); configure the args to snapshot it with in definitions.factories["modal"]']);
    });

    it('snapshots every column any build of the factory has', () => {
        const { definitions } = resolveDefinitions([
            factory('vendorFlagList', [{ view: view('vendor-flag-list', {}, ['code']) }, { view: view('vendor-flag-list', {}, ['code', 'actions']) }])
        ], project);

        expect(Object.keys(projectDefinition(definitions['vendor-flag-list'], 'vendor-flag-list', 2, project).columns)).toEqual(['code', 'actions']);
    });

    it('reports factories that cannot be built, and ignores contrasting builds that fail', () => {
        const { definitions, problems } = resolveDefinitions([
            factory('broken', [{ error: 'subsidiaries[0] is undefined' }, { view: view('broken') }]),
            factory('configured', [{ error: 'boom' }], { generated: false }),
            factory('fine', [{ view: view('fine') }, { error: 'x1 is not a date' }])
        ], project);

        expect(problems).toEqual([
            'broken (src/broken.ts): cannot be built with arguments made up from its parameter types (subsidiaries[0] is undefined); configure its args in definitions.factories["broken"]',
            'configured (src/configured.ts): cannot be built with its configured args (boom)'
        ]);
        expect(Object.keys(definitions)).toEqual(['fine']);
    });

    it('merges exports making the same definition, and reports ones that disagree', () => {
        const { definitions, problems } = resolveDefinitions([
            factory('a', [{ view: view('shared') }]),
            factory('b', [{ view: view('shared') }]),
            factory('c', [{ view: view('shared', { other: 'other' }) }])
        ], project);

        expect(definitions.shared.instances).toHaveLength(2);
        expect(problems).toEqual(['c (src/c.ts): makes views of "shared" whose filters differ from another export\'s']);
    });
});

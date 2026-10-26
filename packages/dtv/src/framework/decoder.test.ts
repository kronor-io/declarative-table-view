import { describe, expect, it } from '@jest/globals';
import * as D from './decoder';
import { isFailure, isSuccess } from './result';

describe('decoder', () => {
    it('reports where an input is invalid', () => {
        const decoder = D.object({ views: D.recordDroppingInvalid(D.object({ items: D.array(D.number) })), name: D.string });
        const { result } = D.decode(decoder, { views: {}, name: 42 });

        expect(isFailure(result) && result.error).toEqual({ path: '$.name', message: 'expected a string, got number 42' });
    });

    it('drops invalid entries and items, as issues, with their paths', () => {
        const decoder = D.recordDroppingInvalid(D.arrayDroppingInvalid(D.object({ id: D.string })));
        const { result, issues } = D.decode(decoder, { 'view-a': [{ id: 'a' }, { id: 1 }], 'not an array': 'x' });

        expect(isSuccess(result) && result.value).toEqual({ 'view-a': [{ id: 'a' }] });
        expect(issues).toEqual([
            { path: '$["view-a"][1].id', message: 'expected a string, got number 1; dropped' },
            { path: '$["not an array"]', message: 'expected an array, got string "x"; dropped' }
        ]);
    });

    it('fills in absent fields silently and invalid ones as issues', () => {
        const decoder = D.object({ rowsPerPage: D.withDefault(D.nullable(D.number), () => null), revision: D.withDefault(D.number, () => 1) });
        const { result, issues } = D.decode(decoder, { rowsPerPage: 'fifty' });

        expect(isSuccess(result) && result.value).toEqual({ rowsPerPage: null, revision: 1 });
        expect(issues).toEqual([{ path: '$.rowsPerPage', message: 'expected a number, got string "fifty"; using the default' }]);
    });

    it('keeps fields its decoder does not know', () => {
        const { result } = D.decode(D.object({ id: D.string }), { id: 'a', addedLater: { nested: [1] } });

        expect(isSuccess(result) && result.value).toEqual({ id: 'a', addedLater: { nested: [1] } });
    });

    it('decodes tagged unions and rejects unknown tags', () => {
        type Shape = { type: 'circle'; radius: number } | { type: 'square'; side: number };
        const shape = D.taggedUnion<Shape>('type', {
            circle: D.object({ type: D.map(D.string, () => 'circle' as const), radius: D.number }),
            square: D.object({ type: D.map(D.string, () => 'square' as const), side: D.number })
        });

        expect(D.decode(shape, { type: 'square', side: 2 }).result).toEqual({ tag: 'success', value: { type: 'square', side: 2 } });
        const unknown = D.decode(shape, { type: 'hexagon' }).result;
        expect(isFailure(unknown) && unknown.error).toEqual({ path: '$.type', message: 'expected one of "circle", "square", got string "hexagon"' });
        const inherited = D.decode(shape, { type: 'toString' }).result;
        expect(isFailure(inherited)).toBe(true);
    });

    it('decodes recursive structures through lazy', () => {
        type Tree = { value: number; children: Tree[] };
        const tree: D.Decoder<Tree> = D.object({ value: D.number, children: D.array(D.lazy(() => tree)) });
        const { result } = D.decode(tree, { value: 1, children: [{ value: 2, children: [{ value: 'x', children: [] }] }] });

        expect(isFailure(result) && result.error.path).toBe('$.children[0].children[0].value');
    });
});

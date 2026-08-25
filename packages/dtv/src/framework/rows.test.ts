import { simplifyRow, simplifyRows } from './rows';

describe('rows helpers', () => {
    test('simplifyRow merges cell objects', () => {
        const raw = { col1: { a: 1 }, col2: { b: 2, c: 3 } };
        expect(simplifyRow(raw)).toEqual({ a: 1, b: 2, c: 3 });
    });

    test('simplifyRow overwrites duplicate keys with right-most value', () => {
        const raw = { c1: { a: 1 }, c2: { a: 2 }, c3: { a: 3, b: 4 } };
        expect(simplifyRow(raw)).toEqual({ a: 3, b: 4 });
    });

    test('simplifyRow on empty row returns empty object', () => {
        expect(simplifyRow({})).toEqual({});
    });

    test('simplifyRows processes multiple rows', () => {
        const rows = [
            { c1: { id: 1, x: 'a' }, c2: { y: 'b' } },
            { c1: { id: 2 }, c2: { z: 'c' } }
        ];
        expect(simplifyRows(rows)).toEqual([
            { id: 1, x: 'a', y: 'b' },
            { id: 2, z: 'c' }
        ]);
    });
});

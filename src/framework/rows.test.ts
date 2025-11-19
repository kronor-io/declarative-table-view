import { simplifyRow, simplifyRows } from './rows';

describe('rows helpers', () => {
    test('simplifyRow merges cell objects', () => {
        const raw = [{ a: 1 }, { b: 2, c: 3 }];
        expect(simplifyRow(raw)).toEqual({ a: 1, b: 2, c: 3 });
    });

    test('simplifyRow overwrites duplicate keys with right-most value', () => {
        const raw = [{ a: 1 }, { a: 2 }, { a: 3, b: 4 }];
        expect(simplifyRow(raw)).toEqual({ a: 3, b: 4 });
    });

    test('simplifyRow on empty row returns empty object', () => {
        expect(simplifyRow([])).toEqual({});
    });

    test('simplifyRows processes multiple rows', () => {
        const rows = [
            [{ id: 1, x: 'a' }, { y: 'b' }],
            [{ id: 2 }, { z: 'c' }]
        ];
        expect(simplifyRows(rows)).toEqual([
            { id: 1, x: 'a', y: 'b' },
            { id: 2, z: 'c' }
        ]);
    });
});

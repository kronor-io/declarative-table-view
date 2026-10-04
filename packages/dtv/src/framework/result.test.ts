import { describe, expect, it } from '@jest/globals';
import { failure, flatMap, getOrElse, success, type Result } from './result';

const parsePositive = (raw: string): Result<string, number> => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? success(n) : failure(`not a positive number: ${raw}`);
};

describe('Result.flatMap', () => {
    it('runs the next step on a success', () => {
        expect(flatMap(parsePositive, success('42'))).toEqual(success(42));
    });

    it('returns the failure of the next step', () => {
        expect(flatMap(parsePositive, success('-1'))).toEqual(failure('not a positive number: -1'));
    });

    it('short-circuits on an earlier failure without calling the next step', () => {
        let called = false;
        const result = flatMap((value: string) => { called = true; return parsePositive(value); }, failure<string, string>('earlier'));

        expect(result).toEqual(failure('earlier'));
        expect(called).toBe(false);
    });
});

describe('Result.getOrElse', () => {
    it('unwraps a success', () => {
        expect(getOrElse(0, success(7))).toBe(7);
    });

    it('falls back on a failure', () => {
        expect(getOrElse(0, failure<string, number>('nope'))).toBe(0);
    });
});

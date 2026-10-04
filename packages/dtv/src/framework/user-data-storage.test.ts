/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readUserDataJson, USER_DATA_LOCALSTORAGE_KEY, writeUserDataJson } from './user-data-storage';
import { defaultUserPreferences, INITIAL_USERDATA_FORMAT_REVISION, type UserDataJson } from './user-data';
import { failure, success } from './result';

const someUserData: UserDataJson = {
    preferences: defaultUserPreferences,
    views: {},
    revision: 7,
    formatRevision: INITIAL_USERDATA_FORMAT_REVISION
};

const failureKind = (result: ReturnType<typeof readUserDataJson>) =>
    result.tag === 'failure' ? result.error.kind : result.tag;

describe('user-data storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('reads nothing when nothing is stored', () => {
        expect(readUserDataJson()).toEqual(success(null));
    });

    it('reads back what was written, under the shared key', () => {
        expect(writeUserDataJson(someUserData)).toEqual(success(undefined));
        expect(localStorage.getItem(USER_DATA_LOCALSTORAGE_KEY)).toBe(JSON.stringify(someUserData));
        expect(readUserDataJson()).toEqual(success(someUserData));
    });

    it('fails as malformed for unparsable or non-object content', () => {
        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, '{not json');
        expect(failureKind(readUserDataJson())).toBe('malformed');

        localStorage.setItem(USER_DATA_LOCALSTORAGE_KEY, '"a string"');
        expect(failureKind(readUserDataJson())).toBe('malformed');
    });

    it('fails as inaccessible when localStorage throws, on read and on write', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        expect(failureKind(readUserDataJson())).toBe('inaccessible');
        expect(writeUserDataJson(someUserData)).toEqual(failure({ kind: 'inaccessible', cause: new Error('quota exceeded') }));

        getItem.mockRestore();
        setItem.mockRestore();
    });
});

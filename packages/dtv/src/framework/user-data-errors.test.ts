import { describe, expect, it } from '@jest/globals';
import { localStorageFailed, userDataManagerErrorToToast, userDataStorageErrorToMessage } from './user-data-errors';

describe('user-data errors', () => {
    it('describes storage errors with their cause', () => {
        expect(userDataStorageErrorToMessage({ kind: 'inaccessible', cause: new Error('denied') }))
            .toBe('localStorage is not accessible (denied)');
        expect(userDataStorageErrorToMessage({ kind: 'malformed', cause: 'garbage' }))
            .toBe('the stored user data is not valid JSON (garbage)');
    });

    it('reports a failed localStorage write as a warning', () => {
        const toast = userDataManagerErrorToToast(localStorageFailed({ kind: 'inaccessible', cause: new Error('quota exceeded') }));

        expect(toast).toMatchObject({ severity: 'warn', summary: 'Saving user data locally failed' });
        expect(toast.detail).toContain('quota exceeded');
    });
});

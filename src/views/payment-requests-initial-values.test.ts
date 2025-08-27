import { parseInitialValue } from '../framework/view-parser';

describe('Payment Requests Date Range Initial Values', () => {
    // Mock runtime with initial values similar to payment requests
    const mockRuntime = {
        cellRenderers: {},
        queryTransforms: {},
        noRowsComponents: {},
        customFilterComponents: {},
        initialValues: {
            dateRangeStart: (() => {
                const date = new Date();
                date.setMonth(date.getMonth() - 1);
                return date; // Return Date object for calendar component
            })(),
            dateRangeEnd: (() => {
                const date = new Date();
                return date; // Return Date object for calendar component
            })()
        }
    };

    it('should resolve date range start initial value correctly', () => {
        const startRef = {
            section: 'initialValues',
            key: 'dateRangeStart'
        };

        const resolvedValue = parseInitialValue(startRef, mockRuntime);
        expect(resolvedValue).toBeInstanceOf(Date); // Should be a Date object

        // Calculate expected date (one month back)
        const expectedDate = new Date();
        expectedDate.setMonth(expectedDate.getMonth() - 1);

        // Compare dates by converting to same day start (ignoring milliseconds)
        expect(resolvedValue.toDateString()).toBe(expectedDate.toDateString());
    }); it('should resolve date range end initial value correctly', () => {
        const endRef = {
            section: 'initialValues',
            key: 'dateRangeEnd'
        };

        const resolvedValue = parseInitialValue(endRef, mockRuntime);
        expect(resolvedValue).toBeInstanceOf(Date); // Should be a Date object

        // Should be today's date
        const today = new Date();
        expect(resolvedValue.toDateString()).toBe(today.toDateString());
    });

    it('should have start date earlier than end date', () => {
        const startRef = { section: 'initialValues', key: 'dateRangeStart' };
        const endRef = { section: 'initialValues', key: 'dateRangeEnd' };

        const startDate = parseInitialValue(startRef, mockRuntime);
        const endDate = parseInitialValue(endRef, mockRuntime);

        expect(startDate.getTime()).toBeLessThan(endDate.getTime());
    });

    it('should have approximately one month difference', () => {
        const startRef = { section: 'initialValues', key: 'dateRangeStart' };
        const endRef = { section: 'initialValues', key: 'dateRangeEnd' };

        const startDate = parseInitialValue(startRef, mockRuntime);
        const endDate = parseInitialValue(endRef, mockRuntime);

        const diffInDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        expect(diffInDays).toBeGreaterThan(27); // At least 27 days (shortest month minus a few days)
        expect(diffInDays).toBeLessThanOrEqual(32); // At most 32 days (longest month plus a day)
    });
});

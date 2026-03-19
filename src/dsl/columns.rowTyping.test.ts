import { column, rowType, valueQuery, objectQuery, arrayQuery } from './columns';

// Type-level regression tests for row-aware column typing.
// These tests don't assert at runtime; they fail if TypeScript can't typecheck.

type ExampleRow = {
    id: string;
    amount: number | null;
    customer?: {
        email: string | null;
        name: string;
    } | null;
    lines: Array<
        | {
              sku: string;
              qty: number | null;
          }
        | null
    > | null;
};

describe('dsl/columns row-aware typing', () => {
    it('infers scalar types for valueQuery', () => {
        column({
            rowType: rowType<ExampleRow>(),
            id: 'id',
            name: 'ID',
            data: [valueQuery({ field: 'id' }), valueQuery({ field: 'amount' })],
            cellRenderer: ({ data }) => {
                const id: string = data.id;
                const amount: number | null = data.amount;
                void id;
                void amount;

                // @ts-expect-error id is string
                const _badId: number = data.id;
                void _badId;

                // @ts-expect-error amount is number|null
                const _badAmount: string = data.amount;
                void _badAmount;

                return null;
            }
        });

        expect(true).toBe(true);
    });

    it('defaults to unknown for keys not included in the provided row slice', () => {
        type RowSlice = Pick<ExampleRow, 'id'>;

        column({
            rowType: rowType<RowSlice>(),
            id: 'mixed',
            name: 'Mixed',
            data: [valueQuery({ field: 'id' }), valueQuery({ field: 'amount' })],
            cellRenderer: ({ data }) => {
                const id: string = data.id;
                const amount: unknown = data.amount;
                void id;
                void amount;

                // @ts-expect-error amount is unknown when not present in the slice
                const _badAmount: number = data.amount;
                void _badAmount;

                return null;
            }
        });

        expect(true).toBe(true);
    });

    it('preserves null/undefined for objectQuery fields', () => {
        column({
            rowType: rowType<ExampleRow>(),
            id: 'customerEmail',
            name: 'Customer Email',
            data: [
                objectQuery({
                    field: 'customer',
                    selectionSet: [valueQuery({ field: 'email' })]
                })
            ],
            cellRenderer: ({ data }) => {
                const email = data.customer?.email;
                const _ok: string | null | undefined = email;
                void _ok;

                // @ts-expect-error email is not a number
                const _bad: number = email;
                void _bad;

                return null;
            }
        });

        expect(true).toBe(true);
    });

    it('preserves list and element nullability for arrayQuery fields', () => {
        column({
            rowType: rowType<ExampleRow>(),
            id: 'lineSku',
            name: 'Line SKU',
            data: [
                arrayQuery({
                    field: 'lines',
                    selectionSet: [valueQuery({ field: 'sku' })]
                })
            ],
            cellRenderer: ({ data }) => {
                const lines = data.lines;
                if (lines === null) return null;

                const firstSku: string | undefined = lines[0]?.sku;
                void firstSku;

                // @ts-expect-error sku is string|undefined
                const _bad: number = firstSku;
                void _bad;

                return null;
            }
        });

        expect(true).toBe(true);
    });
});

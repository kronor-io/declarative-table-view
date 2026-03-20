import { column, rowType, valueQuery, objectQuery, arrayQuery } from './columns';
import { queryForRow } from './internal/queryForRow';

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
    function valueFieldColumn<Row, K extends Extract<keyof Row, string>>(args: {
        rowType: Row;
        id: string;
        name: string;
        field: K;
    }) {
        return column({
            rowType: args.rowType,
            id: args.id,
            name: args.name,
            data: [valueQuery({ field: args.field })],
            cellRenderer: ({ data }) => {
                const typedData = data as unknown as Record<K, Row[K]>;
                const value: Row[K] = typedData[args.field];
                void value;
                return null;
            }
        });
    }

    function idColumn<Row extends { id: unknown }>(args: {
        rowType: Row;
        id: string;
        name: string;
    }) {
        return column({
            rowType: args.rowType,
            id: args.id,
            name: args.name,
            data: [valueQuery({ field: 'id' })],
            cellRenderer: ({ data }) => {
                const id: Row['id'] = data.id;
                void id;
                return null;
            }
        });
    }

    function stringIdColumn<Row extends { id: string }>(rowTypeArg: Row) {
        return column({
            rowType: rowTypeArg,
            id: 'id',
            name: 'ID',
            data: [valueQuery({ field: 'id' })],
            cellRenderer: ({ data }) => {
                const id: string = data.id;
                void id;

                // @ts-expect-error id is string
                const _bad: number = data.id;
                void _bad;

                return null;
            }
        });
    }

    it('supports reusable column helper functions', () => {
        valueFieldColumn({
            rowType: rowType<ExampleRow>(),
            id: 'id',
            name: 'ID',
            field: 'id'
        });

        valueFieldColumn({
            rowType: rowType<ExampleRow>(),
            id: 'nope',
            name: 'Nope',
            // @ts-expect-error field must exist on ExampleRow
            field: 'doesNotExist'
        });

        idColumn({
            rowType: rowType<ExampleRow>(),
            id: 'id',
            name: 'ID'
        });

        type RowWithoutId = { amount: number };
        idColumn({
            // @ts-expect-error Row must have an id field
            rowType: rowType<RowWithoutId>(),
            id: 'id',
            name: 'ID'
        });

        // Force the slice to treat id as string
        stringIdColumn(rowType<ExampleRow>());

        type RowIdNumber = { id: number };
        // @ts-expect-error id must be string
        stringIdColumn(rowType<RowIdNumber>());

        type RowIdUnknown = { id: unknown };
        // Explicitly specialize the slice: treat unknown id as string for this column
        stringIdColumn(rowType<RowIdUnknown>() as RowIdUnknown & { id: string });

        expect(true).toBe(true);
    });

    it('supports a reusable column helper that uses an object query', () => {
        type Row = {
            customer?: {
                email: string | null;
                name: string;
            } | null;
        };

        function customerEmailColumn(rowTypeArg: Row) {
            const q = queryForRow<Row>();
            return column({
                rowType: rowTypeArg,
                id: 'customerEmail',
                name: 'Customer Email',
                data: [
                    q.object('customer', customer => [
                        customer.value('email'),
                    ])
                ],
                cellRenderer: ({ data }) => {
                    const email: string | null | undefined = data.customer?.email;
                    void email;

                    // @ts-expect-error name is not selected in the query
                    const _name = data.customer?.name;
                    void _name;

                    // @ts-expect-error email is string|null|undefined
                    const _bad: number = email;
                    void _bad;

                    return null;
                }
            });
        }

        customerEmailColumn(rowType<Row>());

        type RowWithoutCustomer = { id: string };
        // @ts-expect-error helper requires customer.email to exist
        customerEmailColumn(rowType<RowWithoutCustomer>());

        expect(true).toBe(true);
    });
    it('rejects selecting fields not present on the row type', () => {
        // @ts-expect-error unknownField is not a key of ExampleRow
        column({
            rowType: rowType<ExampleRow>(),
            id: 'bad',
            name: 'Bad',
            data: [valueQuery({ field: 'unknownField' })],
            cellRenderer: () => null
        });

        expect(true).toBe(true);
    });

    it('rejects nested selections not present on the nested row type', () => {
        // @ts-expect-error unknownNestedField is not a key of ExampleRow.customer
        column({
            rowType: rowType<ExampleRow>(),
            id: 'badNested',
            name: 'Bad Nested',
            data: [objectQuery({ field: 'customer', selectionSet: [valueQuery({ field: 'unknownNestedField' })] })],
            cellRenderer: () => null
        });

        // @ts-expect-error unknownLineField is not a key of ExampleRow.lines element
        column({
            rowType: rowType<ExampleRow>(),
            id: 'badNestedArray',
            name: 'Bad Nested Array',
            data: [arrayQuery({ field: 'lines', selectionSet: [valueQuery({ field: 'unknownLineField' })] })],
            cellRenderer: () => null
        });

        expect(true).toBe(true);
    });

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

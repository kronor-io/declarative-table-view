import { describe, it, expect } from '@jest/globals';
import { fieldColumn, rowType, valueQuery, type FieldCellRendererProps } from './columns';
import type { QueryForRowSafe } from '@kronor/hasura-graphql';
import type { ColumnFieldValue, ValidateColumnFieldType } from './columnTyping';
import type { DslTypeError } from './typeErrors';

// Type-level regression tests for fieldColumn and ValidateColumnFieldType.
// They are checked by `tsc -b` (tsconfig.jest.json); jest only transpiles them.

type Account = { accountNr: string; accountName: string | null };

type ExampleRow = {
    id: string;
    name: string;
    memo: string | null;
    posted: boolean;
    arAccount: Account | null;
    bankAccount: Account;
    payload: unknown;
    customer: { account: Account } | null;
    lines: Array<{ sku: string; qty: number | null }> | null;
    note?: string;
    createdAt: Date;
};

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assertType = <T extends true>(): T => true as T;

const renderAccount = ({ value }: FieldCellRendererProps<Account | null>) =>
    value === null ? null : `${value.accountNr} ${value.accountName ?? ''}`;

const renderRequiredAccount = ({ value }: FieldCellRendererProps<Account>) => value.accountNr;

const renderString = ({ value }: FieldCellRendererProps<string>) => value;

/** A shared column whose field comes from the caller: it renders an account, or nothing. */
function accountColumn<Row, const Field extends string>(
    rowTypeArg: Row,
    field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
) {
    return fieldColumn<Row, Field, Account | null>({
        rowType: rowTypeArg,
        field,
        name: 'Account',
        select: { object: [valueQuery({ field: 'accountNr' }), valueQuery({ field: 'accountName' })] },
        cellRenderer: renderAccount,
    });
}

describe('dsl/columnTyping fieldColumn', () => {
    it('accepts a field holding the value its renderer takes, with or without null', () => {
        accountColumn(rowType<ExampleRow>(), 'arAccount');
        accountColumn(rowType<ExampleRow>(), 'bankAccount');
        accountColumn(rowType<ExampleRow>(), 'customer.account');
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'bankAccount',
            name: 'Bank account',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: renderRequiredAccount,
        });
        expect(true).toBe(true);
    });

    it('rejects a nullable field when the renderer does not handle null, also through a nullable object', () => {
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            // @ts-expect-error arAccount can be null
            field: 'arAccount',
            name: 'AR account',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: renderRequiredAccount,
        });
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'arAccount', Account>,
            DslTypeError<"field 'arAccount' can be null, and this column does not render null">
        >>();
        // customer.account is not nullable itself, but customer is
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'customer.account', Account>,
            DslTypeError<"field 'customer.account' can be null, and this column does not render null">
        >>();
        expect(true).toBe(true);
    });

    it('rejects a renderer that does not handle null when the value type given admits it', () => {
        fieldColumn<ExampleRow, 'arAccount', Account | null>({
            rowType: rowType<ExampleRow>(),
            field: 'arAccount',
            name: 'AR account',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            // @ts-expect-error the column is declared to render null, and this renderer does not
            cellRenderer: renderRequiredAccount,
        });
        expect(true).toBe(true);
    });

    it('reads a missing field as null, as the cell does', () => {
        assertType<Equal<ColumnFieldValue<ExampleRow, 'note'>, string | null>>();
        assertType<Equal<ColumnFieldValue<{ maybe?: { id: string } }, 'maybe.id'>, string | null>>();
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'note',
            name: 'Note',
            cellRenderer: ({ value }) => {
                const note: string | null = value;
                return note;
            },
        });
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'note', string>,
            DslTypeError<"field 'note' can be null, and this column does not render null">
        >>();
        expect(true).toBe(true);
    });

    it('rejects a field holding something else, a field not on the row, and a path through a list', () => {
        // @ts-expect-error name is a string
        accountColumn(rowType<ExampleRow>(), 'name');
        // @ts-expect-error not on the row
        accountColumn(rowType<ExampleRow>(), 'arAcount');
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'memo', Account | null>,
            DslTypeError<"field 'memo' holds string, and this column renders an object">
        >>();
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'createdAt', string>,
            DslTypeError<"field 'createdAt' holds Date, and this column renders string">
        >>();
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'arAcount', Account | null>,
            DslTypeError<"field 'arAcount' is not on the row">
        >>();
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, string, Account | null>,
            DslTypeError<"the field must be a literal path; a helper takes it as 'Field & ValidateColumnFieldType<Row, Field, Value>'">
        >>();
        assertType<Equal<
            ValidateColumnFieldType<ExampleRow, 'lines.sku', string>,
            DslTypeError<"field 'lines.sku' goes through the list 'lines'; select the list instead">
        >>();
        expect(true).toBe(true);
    });

    it('rejects a field typed as plain string, also when handed on by a generic helper', () => {
        function forgotTheBrand<Row>(rowTypeArg: Row, field: string) {
            // @ts-expect-error a plain string field cannot be checked
            return accountColumn(rowTypeArg, field);
        }
        function forgotTheBrandConcrete(field: string) {
            // @ts-expect-error a plain string field cannot be checked
            return accountColumn(rowType<ExampleRow>(), field);
        }
        void forgotTheBrand;
        void forgotTheBrandConcrete;
        expect(true).toBe(true);
    });

    it('lets a helper hand its checked field on, with or without type arguments', () => {
        function namedAccountColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return accountColumn<Row, Field>(rowTypeArg, field);
        }
        function inferredAccountColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return accountColumn(rowTypeArg, field);
        }
        // A renderer declared with its value type is enough for fieldColumn to infer it.
        function annotatedRenderer<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: renderAccount,
            });
        }
        // An inline renderer declares nothing, and gets the type the field was checked against.
        function inlineRenderer<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: ({ value }) => {
                    assertType<Equal<typeof value, Account | null>>();
                    return value?.accountNr ?? null;
                },
            });
        }
        // ...so it has to handle what that type admits.
        function inlineRendererIgnoringNull<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                select: { object: [valueQuery({ field: 'accountNr' })] },
                // @ts-expect-error value is possibly null
                cellRenderer: ({ value }) => value.accountNr,
            });
        }
        // A declared renderer still has to accept what the field was checked against.
        function requiredRendererOnNullableField<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                // @ts-expect-error the field may hold null, and this renderer does not render null
                field,
                name: 'Account',
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: renderRequiredAccount,
            });
        }
        namedAccountColumn(rowType<ExampleRow>(), 'arAccount');
        inferredAccountColumn(rowType<ExampleRow>(), 'arAccount');
        annotatedRenderer(rowType<ExampleRow>(), 'arAccount');
        // @ts-expect-error name is a string
        namedAccountColumn(rowType<ExampleRow>(), 'name');
        // @ts-expect-error name is a string
        inferredAccountColumn(rowType<ExampleRow>(), 'name');
        inlineRenderer(rowType<ExampleRow>(), 'arAccount');
        void inlineRendererIgnoringNull;
        void requiredRendererOnNullableField;
        expect(true).toBe(true);
    });

    it('compares the value types when a helper hands its field on', () => {
        // A field checked to hold an account may go where an account or null is rendered...
        function requiredAccountColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account>,
        ) {
            return accountColumn<Row, Field>(rowTypeArg, field);
        }
        // ...but not the other way round, and not where something else is rendered.
        function nullableToRequired<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn<Row, Field, Account>({
                rowType: rowTypeArg,
                // @ts-expect-error the field may hold null, and this column does not render null
                field,
                name: 'Account',
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: renderRequiredAccount,
            });
        }
        function accountToString<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn<Row, Field, string>({
                rowType: rowTypeArg,
                // @ts-expect-error the field holds an account, and this column renders a string
                field,
                name: 'Account',
                cellRenderer: ({ value }) => value,
            });
        }
        function unbranded<Row, const Field extends string>(rowTypeArg: Row, field: Field) {
            // @ts-expect-error nothing has checked this field
            return accountColumn<Row, Field>(rowTypeArg, field);
        }
        requiredAccountColumn(rowType<ExampleRow>(), 'bankAccount');
        // @ts-expect-error arAccount can be null
        requiredAccountColumn(rowType<ExampleRow>(), 'arAccount');
        void nullableToRequired;
        void accountToString;
        void unbranded;
        expect(true).toBe(true);
    });

    // The same comparisons with the type arguments left to inference, which goes through a
    // different path in the checker (see CheckedAs in ./typeErrors).
    it('compares the value types when a helper hands its field on without type arguments', () => {
        function stringColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, string>,
        ) {
            return fieldColumn({ rowType: rowTypeArg, field, name: 'Text', cellRenderer: renderString });
        }
        function requiredAccountColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account>,
        ) {
            return accountColumn(rowTypeArg, field);
        }
        function accountToString<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            // @ts-expect-error the field holds an account, and this column renders a string
            return stringColumn(rowTypeArg, field);
        }
        function unbranded<Row, const Field extends string>(rowTypeArg: Row, field: Field) {
            // @ts-expect-error nothing has checked this field
            return accountColumn(rowTypeArg, field);
        }
        requiredAccountColumn(rowType<ExampleRow>(), 'bankAccount');
        // @ts-expect-error arAccount can be null
        requiredAccountColumn(rowType<ExampleRow>(), 'arAccount');
        void accountToString;
        void unbranded;
        expect(true).toBe(true);
    });

    it('checks fieldColumn inside a helper without type arguments as it does at a call', () => {
        // A renderer for something wider than the field was checked against is fine...
        function wideRenderer<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: renderAccount,
            });
        }
        // ...one for something else is not...
        function stringRenderer<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                // @ts-expect-error the field holds an account, and this renderer renders a string
                field,
                name: 'Account',
                cellRenderer: renderString,
            });
        }
        // ...and the selection still follows from the value type.
        function missingSelect<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            // @ts-expect-error an object field needs its selection
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                cellRenderer: renderAccount,
            });
        }
        wideRenderer(rowType<ExampleRow>(), 'bankAccount');
        void stringRenderer;
        void missingSelect;
        expect(true).toBe(true);
    });

    it('decides and checks the selection from the value type', () => {
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'posted',
            name: 'Posted',
            cellRenderer: ({ value }) => {
                const posted: boolean = value;
                return String(posted);
            },
        });
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'posted',
            name: 'Posted',
            // @ts-expect-error a scalar field selects nothing inside it
            select: { object: [] },
            cellRenderer: () => null,
        });
        // @ts-expect-error an object field needs its selection
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'arAccount',
            name: 'AR account',
            cellRenderer: () => null,
        });
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'arAccount',
            name: 'AR account',
            // @ts-expect-error accountNumber is not a field of the account
            select: { object: [valueQuery({ field: 'accountNumber' })] },
            cellRenderer: () => null,
        });
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'lines',
            name: 'SKUs',
            select: { list: [valueQuery({ field: 'sku' })], limit: 5 },
            cellRenderer: ({ value }) => (value ?? []).map(line => line.sku).join(', '),
        });
        expect(true).toBe(true);
    });

    it('orders by the field itself, or a scalar inside it', () => {
        fieldColumn({ rowType: rowType<ExampleRow>(), field: 'posted', name: 'Posted', orderBy: 'posted', cellRenderer: () => null });
        fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'customer.account',
            name: 'Customer account',
            orderBy: 'customer.account.accountNr',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: () => null,
        });
        // Type-level only: built, these would also be rejected at runtime.
        const rejected = () => [fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'customer.account',
            name: 'Customer account',
            // @ts-expect-error accountNumber is not a field of the account
            orderBy: 'customer.account.accountNumber',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: () => null,
        }), fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'arAccount',
            name: 'AR account',
            // @ts-expect-error an object column orders by a field inside it
            orderBy: 'arAccount',
            select: { object: [valueQuery({ field: 'accountNr' })] },
            cellRenderer: () => null,
        }), fieldColumn({
            rowType: rowType<ExampleRow>(),
            field: 'lines',
            name: 'SKUs',
            // @ts-expect-error a list column cannot be ordered by
            orderBy: 'lines.sku',
            select: { list: [valueQuery({ field: 'sku' })] },
            cellRenderer: () => null,
        })];
        void rejected;
        expect(true).toBe(true);
    });

    it('lets a helper order by a scalar inside the field it is given', () => {
        function orderedAccountColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn<Row, Field, Account | null>({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                orderBy: `${field}.accountNr`,
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: renderAccount,
            });
        }
        function inferredOrderedAccountColumn<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                orderBy: `${field}.accountNr`,
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: ({ value }) => value?.accountNr ?? null,
            });
        }
        function badOrderBy<Row, const Field extends string>(
            rowTypeArg: Row,
            field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
        ) {
            return fieldColumn({
                rowType: rowTypeArg,
                field,
                name: 'Account',
                // @ts-expect-error accountNumber is not a field of the account
                orderBy: `${field}.accountNumber`,
                select: { object: [valueQuery({ field: 'accountNr' })] },
                cellRenderer: ({ value }) => value?.accountNr ?? null,
            });
        }
        orderedAccountColumn(rowType<ExampleRow>(), 'arAccount');
        inferredOrderedAccountColumn(rowType<ExampleRow>(), 'arAccount');
        void badOrderBy;
        expect(true).toBe(true);
    });

    it('accepts a selection typed up front, as a helper builds it', () => {
        const accountSelection: readonly QueryForRowSafe<Account>[] = [valueQuery({ field: 'accountNr' })];
        fieldColumn<ExampleRow, 'arAccount', Account | null>({
            rowType: rowType<ExampleRow>(),
            field: 'arAccount',
            name: 'AR account',
            select: { object: accountSelection },
            cellRenderer: renderAccount,
        });
        expect(true).toBe(true);
    });

    it('accepts anything for opaque fields and rows', () => {
        accountColumn(rowType<ExampleRow>(), 'payload');
        accountColumn(rowType<Record<string, unknown>>(), 'whatever');
        expect(true).toBe(true);
    });
});

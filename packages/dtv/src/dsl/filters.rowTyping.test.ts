import { describe, it } from '@jest/globals';
import { rowType } from './columns';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { type FilterField, filter, filterField } from './filters';
import type { ValidateFilterFieldType } from './filterTyping';
import type { DslTypeError } from './typeErrors';

// Type-level regression tests for row-aware filter typing.
// These tests don't assert at runtime; they fail if TypeScript can't typecheck.

type ExampleRow = {
    id: string;
    amount: number | null;
    customer?: {
        email: string | null;
        name: string;
    } | null;
    lines: Array<{
        sku: string;
        qty: number | null;
    }>;
};

type TypedRow = {
    id: string;
    amount: number | null;
    live: boolean;
    // Hasura's date scalars are generated as string.
    createdAt: string;
    status: 'pending' | 'paid';
    tags: string[];
    payload: any;
    customer: { email: string | null; age: number | null } | null;
};

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assertType = <T extends true>(): T => true as T;

describe('dsl/filters row-aware typing', () => {
    // A helper whose row type is still a type parameter: the control/operator
    // checks cannot be evaluated there and are skipped, so the brand on
    // `field` is what keeps callers honest.
    function equalsTextFilter<Row, const Field extends FilterField>(args: {
        rowType: Row;
        id: string;
        label: string;
        field: Field & ValidateFilterFieldType<Row, Field, string>;
    }) {
        return filter({
            rowType: args.rowType,
            id: args.id,
            label: args.label,
            expression: FilterExpr.equals({ field: args.field, control: FilterControl.text() })
        });
    }

    it('validates filter expression fields against the row type', () => {
        filter({
            rowType: rowType<ExampleRow>(),
            id: 'id',
            label: 'ID',
            expression: FilterExpr.equals({ field: 'id', control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'customer-email',
            label: 'Customer Email',
            expression: FilterExpr.equals({ field: 'customer.email', control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'line-sku',
            label: 'Line SKU',
            expression: FilterExpr.equals({ field: 'lines.sku', control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'id-or-sku',
            label: 'ID or SKU',
            expression: FilterExpr.like({ field: filterField.or('id', 'lines.sku'), control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'amount-range',
            label: 'Amount Range',
            expression: FilterExpr.range({ field: 'amount', control: FilterControl.number })
        });
    });

    it('requires a rowType', () => {
        // @ts-expect-error a filter has to say which row it is built on
        filter({
            id: 'no-row-type',
            label: 'rowType is required',
            expression: FilterExpr.equals({ field: 'anything.goes', control: FilterControl.text() })
        });
    });

    it('supports reusable filter helper functions', () => {
        equalsTextFilter({
            rowType: rowType<ExampleRow>(),
            id: 'id',
            label: 'ID',
            field: 'id'
        });

        equalsTextFilter({
            rowType: rowType<ExampleRow>(),
            id: 'customer-email',
            label: 'Customer Email',
            field: 'customer.email'
        });

        equalsTextFilter({
            rowType: rowType<ExampleRow>(),
            id: 'bad',
            label: 'Bad',
            // @ts-expect-error field must exist on ExampleRow
            field: 'doesNotExist'
        });
    });

    it('checks the field a helper is given against the type its control produces', () => {
        equalsTextFilter({
            rowType: rowType<ExampleRow>(),
            id: 'amount',
            label: 'Amount',
            // @ts-expect-error amount is numeric, and a text filter needs a string
            field: 'amount'
        });
        equalsTextFilter({
            rowType: rowType<ExampleRow>(),
            id: 'email-or-name',
            label: 'Email or name',
            field: filterField.or('customer.email', 'customer.name')
        });
        equalsTextFilter({
            rowType: rowType<ExampleRow>(),
            id: 'email-or-nope',
            label: 'Email or nope',
            // @ts-expect-error every field of a group has to be on the row
            field: filterField.or('customer.email', 'nope')
        });
    });

    it('rejects a plain string field given to a helper, also by a generic one', () => {
        function forgotTheBrand<Row>(rowTypeArg: Row, field: string) {
            // @ts-expect-error a plain string field cannot be checked
            return equalsTextFilter({ rowType: rowTypeArg, id: 'x', label: 'x', field });
        }
        function forgotTheBrandConcrete(field: string) {
            // @ts-expect-error a plain string field cannot be checked
            return equalsTextFilter({ rowType: rowType<ExampleRow>(), id: 'x', label: 'x', field });
        }
        void forgotTheBrand;
        void forgotTheBrandConcrete;
    });

    it('lets a helper hand its checked field on with explicit type arguments', () => {
        function searchFilter<Row, const Field extends FilterField>(args: {
            rowType: Row;
            field: Field & ValidateFilterFieldType<Row, Field, string>;
        }) {
            return equalsTextFilter<Row, Field>({ rowType: args.rowType, id: 'search', label: 'Search', field: args.field });
        }
        searchFilter({ rowType: rowType<ExampleRow>(), field: 'id' });
        // @ts-expect-error amount is numeric
        searchFilter({ rowType: rowType<ExampleRow>(), field: 'amount' });
    });

    it('compares the value types when a helper hands its field on', () => {
        function amountFilter<Row, const Field extends FilterField>(args: {
            rowType: Row;
            field: Field & ValidateFilterFieldType<Row, Field, number>;
        }) {
            // @ts-expect-error the field holds a number, and a text filter needs a string
            return equalsTextFilter<Row, Field>({ rowType: args.rowType, id: 'a', label: 'A', field: args.field });
        }
        function unbranded<Row, const Field extends FilterField>(args: { rowType: Row; field: Field }) {
            // @ts-expect-error nothing has checked this field
            return equalsTextFilter<Row, Field>({ rowType: args.rowType, id: 'a', label: 'A', field: args.field });
        }
        function idFilter<Row, const Field extends FilterField>(args: {
            rowType: Row;
            field: Field & ValidateFilterFieldType<Row, Field, 'pending' | 'paid'>;
        }) {
            // an enum field is a string field
            return equalsTextFilter<Row, Field>({ rowType: args.rowType, id: 'a', label: 'A', field: args.field });
        }
        void amountFilter;
        void unbranded;
        void idFilter;
    });

    // The same with the type arguments left to inference, which goes through a different path in
    // the checker (see CheckedAs in ./typeErrors).
    it('compares the value types when a helper hands its field on without type arguments', () => {
        function searchFilter<Row, const Field extends FilterField>(args: {
            rowType: Row;
            field: Field & ValidateFilterFieldType<Row, Field, string>;
        }) {
            return equalsTextFilter({ rowType: args.rowType, id: 'search', label: 'Search', field: args.field });
        }
        function amountFilter<Row, const Field extends FilterField>(args: {
            rowType: Row;
            field: Field & ValidateFilterFieldType<Row, Field, number>;
        }) {
            // @ts-expect-error the field holds a number, and a text filter needs a string
            return equalsTextFilter({ rowType: args.rowType, id: 'a', label: 'A', field: args.field });
        }
        function unbranded<Row, const Field extends FilterField>(args: { rowType: Row; field: Field }) {
            // @ts-expect-error nothing has checked this field
            return equalsTextFilter({ rowType: args.rowType, id: 'a', label: 'A', field: args.field });
        }
        searchFilter({ rowType: rowType<ExampleRow>(), field: 'id' });
        // @ts-expect-error amount is numeric
        searchFilter({ rowType: rowType<ExampleRow>(), field: 'amount' });
        void amountFilter;
        void unbranded;
    });

    it('says what is wrong with a field given to a helper', () => {
        assertType<Equal<
            ValidateFilterFieldType<TypedRow, string, string>,
            DslTypeError<"the field must be a literal path; a helper takes it as 'Field & ValidateFilterFieldType<Row, Field, Value>'">
        >>();
        assertType<Equal<
            ValidateFilterFieldType<TypedRow, 'nope', string>,
            DslTypeError<"'nope' is not a field of the row type">
        >>();
        assertType<Equal<
            ValidateFilterFieldType<TypedRow, 'createdAt', number>,
            DslTypeError<"field 'createdAt' holds string, and this filter needs number">
        >>();
        assertType<Equal<
            ValidateFilterFieldType<TypedRow, { or: ['amount', 'nope'] }, number>,
            DslTypeError<"'nope' is not a field of the row type">
        >>();
        assertType<Equal<ValidateFilterFieldType<TypedRow, 'amount', number>, unknown>>();
        assertType<Equal<ValidateFilterFieldType<TypedRow, 'payload', number>, unknown>>();
    });

    it('rejects unknown filter fields (including nested paths)', () => {
        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-top-level',
            label: 'Bad',
            // @ts-expect-error field must exist on ExampleRow
            expression: FilterExpr.equals({ field: 'doesNotExist', control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-nested',
            label: 'Bad nested',
            // @ts-expect-error nested field must exist on ExampleRow
            expression: FilterExpr.equals({ field: 'customer.doesNotExist', control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-array-nested',
            label: 'Bad array nested',
            // @ts-expect-error nested field must exist on ExampleRow
            expression: FilterExpr.equals({ field: 'lines.doesNotExist', control: FilterControl.text() })
        });

        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-multi-field',
            label: 'Bad multi',
            // @ts-expect-error multi-field must reference only valid row fields
            expression: FilterExpr.equals({ field: filterField.and('id', 'nope'), control: FilterControl.text() })
        });
    });

    // A helper that only makes sense on one kind of column brands its own
    // field, so its callers are checked even though the checks inside cannot
    // be evaluated while Row is a type parameter.
    function numberRangeFilter<Row, const Field extends FilterField>(args: {
        rowType: Row;
        id: string;
        label: string;
        field: Field & ValidateFilterFieldType<Row, Field, number>;
    }) {
        return filter({
            rowType: args.rowType,
            id: args.id,
            label: args.label,
            expression: FilterExpr.range({ field: args.field, control: FilterControl.number })
        });
    }

    it('accepts a field that holds the type the helper needs', () => {
        numberRangeFilter({ rowType: rowType<TypedRow>(), id: 'amount', label: 'Amount', field: 'amount' });
        numberRangeFilter({ rowType: rowType<TypedRow>(), id: 'age', label: 'Age', field: 'customer.age' });
        // json/jsonb columns are `any` and tell us nothing, so they pass
        numberRangeFilter({ rowType: rowType<TypedRow>(), id: 'payload', label: 'Payload', field: 'payload' });
    });

    it('rejects a field that holds something else', () => {
        numberRangeFilter({
            rowType: rowType<TypedRow>(),
            id: 'bad',
            label: 'Bad',
            // @ts-expect-error createdAt is a string column, not a numeric one
            field: 'createdAt'
        });

        numberRangeFilter({
            rowType: rowType<TypedRow>(),
            id: 'bad-list',
            label: 'Bad',
            // @ts-expect-error a list column holds a list, not a number
            field: 'tags'
        });

        numberRangeFilter({
            rowType: rowType<TypedRow>(),
            id: 'bad-group',
            label: 'Bad',
            // @ts-expect-error every field of a group has to hold the type
            field: filterField.or('amount', 'status')
        });
    });

    it('rejects a field typed as plain string, which no check can see', () => {
        function textFilterFor(field: string) {
            return filter({
                rowType: rowType<ExampleRow>(),
                id: 'x',
                label: 'x',
                // @ts-expect-error a plain string field names no path on the row
                expression: FilterExpr.equals({ field, control: FilterControl.text() })
            });
        }
        void textFilterFor;
    });
});

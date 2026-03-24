import { rowType } from './columns';
import { FilterControl } from './filterControl';
import { FilterExpr } from './filterExpr';
import { type FilterFieldPath, filter, filterField } from './filters';

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

describe('dsl/filters row-aware typing', () => {
    function equalsTextFilter<Row, const Field extends FilterFieldPath<Row>>(args: {
        rowType: Row;
        id: string;
        label: string;
        field: Field;
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

        filter({
            id: 'untyped',
            label: 'Untyped still allowed',
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

    it('rejects unknown filter fields (including nested paths)', () => {
        // @ts-expect-error field must exist on ExampleRow
        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-top-level',
            label: 'Bad',
            expression: FilterExpr.equals({ field: 'doesNotExist', control: FilterControl.text() })
        });

        // @ts-expect-error nested field must exist on ExampleRow
        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-nested',
            label: 'Bad nested',
            expression: FilterExpr.equals({ field: 'customer.doesNotExist', control: FilterControl.text() })
        });

        // @ts-expect-error nested field must exist on ExampleRow
        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-array-nested',
            label: 'Bad array nested',
            expression: FilterExpr.equals({ field: 'lines.doesNotExist', control: FilterControl.text() })
        });

        // @ts-expect-error multi-field must reference only valid row fields
        filter({
            rowType: rowType<ExampleRow>(),
            id: 'bad-multi-field',
            label: 'Bad multi',
            expression: FilterExpr.equals({ field: filterField.and('id', 'nope'), control: FilterControl.text() })
        });
    });
});

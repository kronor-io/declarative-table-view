/**
 * Type-level validation of a filter expression against a row type.
 *
 * Every leaf's `field` has to name a real path on the row — and beyond that,
 * the two things a path alone cannot express:
 *
 *   - the *control* must be able to produce a value of the field's type — a
 *     `text` control cannot filter a numeric column, and a dropdown's item
 *     values must be values the column can hold;
 *   - the *operator* must be one Hasura offers for that type — `iLike` on a
 *     number, `greaterThan` on a boolean.
 *
 * Both derive from the same source of truth as the row-scoped Hasura DSL:
 * `HasuraOperatorFor<Value>` decides which operators exist for a value type,
 * so `FilterExpr.iLike({ field: 'amount' })` and `H.condition('amount',
 * H.ilike(...))` now agree.
 *
 * Failures surface as a `FilterTypeError`, whose single property *name* is the
 * message, so tsc prints it verbatim at the `filter()` call.
 *
 * Deliberate escape hatches — all of them cases where the declared shape no
 * longer describes what reaches the query:
 *   - a leaf carrying a `transform` is exempt from the control and operator
 *     checks (a transform may re-map the value, the field, or return a whole
 *     condition). Its `customOperator` operator list is still checked, since
 *     the built-in transform passes those operators straight to Hasura.
 *   - `json`/`jsonb` columns (typed `any`) and rows with an index signature
 *     accept anything.
 *   - `custom` and `autocomplete` controls have transform-defined values, so
 *     only their operator is checked.
 *   - `dropdown`/`multiselect` item lists and `customOperator` operator lists
 *     are only checked when written inline (a tuple); a list built at runtime
 *     is widened and cannot be inspected.
 */
import type { HasuraOperatorFor, PathValue } from '@kronor/hasura-graphql';
import type { FilterControl, FilterExpr, TransformConditionResult } from '../framework/filters';

/**
 * A failed check. The message is the property name so that tsc reports
 * "Property '<message>' is missing ..." instead of a structural diff.
 */
export type FilterTypeError<Message extends string> = { [K in Message]: never };

/** Mutable counterpart of an inferred `readonly` tuple. */
export type MutableTuple<T extends readonly unknown[]> = [...T];

// --- type-level helpers ----------------------------------------------------

type IsAny<T> = 0 extends 1 & T ? true : false;
type IsTuple<T> = T extends readonly unknown[] ? (number extends T['length'] ? false : true) : false;

/** Value types nothing can be concluded from: json/jsonb columns, widened rows. */
type Opaque<Value> = IsAny<Value> extends true ? true : unknown extends Value ? true : false;

type Accepts<Value, Allowed> = [Extract<Value, Allowed>] extends [never] ? false : true;

/** Non-distributive so that literal unions (Hasura enums) describe as one word. */
type DescribeType<Value> =
    [Value] extends [string] ? 'string'
    : [Value] extends [number] ? 'number'
    : [Value] extends [boolean] ? 'boolean'
    : [Value] extends [Date] ? 'Date'
    : [Value] extends [readonly unknown[]] ? 'a list'
    : [Value] extends [object] ? 'an object'
    : 'unknown';

type ShowValue<Value> =
    [Value] extends [string] ? `'${Value}'`
    : [Value] extends [number] ? `${Value}`
    : [Value] extends [boolean] ? `${Value}`
    : DescribeType<Value>;

// --- the filter leaf -------------------------------------------------------

/** Leaf operator -> the Hasura operator `buildHasuraConditions` emits for it. */
type LeafHasuraOperator = {
    equals: '_eq';
    notEquals: '_neq';
    greaterThan: '_gt';
    lessThan: '_lt';
    greaterThanOrEqual: '_gte';
    lessThanOrEqual: '_lte';
    in: '_in';
    notIn: '_nin';
    like: '_like';
    iLike: '_ilike';
    isNull: '_isNull';
};

/** The operators a leaf filter expression can carry. */
export type FilterLeafOperator = keyof LeafHasuraOperator;

/** Every field path a leaf filters on: one for a plain field, N for and/or groups. */
type PathsOf<Field> =
    Field extends string ? readonly [Field]
    : Field extends { and: infer Paths extends readonly string[] } ? Paths
    : Field extends { or: infer Paths extends readonly string[] } ? Paths
    : readonly [];

type HasTransform<Leaf> = 'transform' extends keyof Leaf
    ? [Exclude<Leaf['transform'], undefined>] extends [never] ? false : true
    : false;

// --- individual checks -----------------------------------------------------

type PathError<Row, Path extends string> = [PathValue<Row, Path>] extends [never]
    ? `'${Path}' is not a field of the row type`
    : never;

type ControlError<Path extends string, Value, Control extends FilterControl> =
    Control extends { type: 'dropdown' | 'multiselect'; items: infer Items }
        ? ItemValueError<Path, Value, Items>
        : ControlAccepts<Value, Control> extends true
            ? never
            : `control '${Control['type']}' cannot produce a value for '${Path}' (type ${DescribeType<Value>})`;

type ControlAccepts<Value, Control extends FilterControl> =
    Control extends { type: 'text' } ? Accepts<Value, string>
    : Control extends { type: 'number' } ? Accepts<Value, number>
    // Hasura date/timestamp scalars are generated as `string`, so a date
    // control has to be allowed against those as well as real Date columns.
    : Control extends { type: 'date' } ? Accepts<Value, string | number | Date>
    : true;

/**
 * An item stands for one value of the field, so a list column is compared
 * against its element type: a multiselect over `text[]` offers the individual
 * strings, not lists of them.
 */
type ItemTarget<Value> = Value extends readonly (infer Element)[] ? NonNullable<Element> : Value;

type ItemValueError<Path extends string, Value, Items> =
    IsTuple<Items> extends false ? never
    : Items extends readonly { value: infer ItemValue }[]
        ? IsAny<ItemValue> extends true ? never
        : Exclude<ItemValue, ItemTarget<Value>> extends infer Rejected
            ? [Rejected] extends [never] ? never
            : `item value ${ShowValue<Rejected>} is not a possible value of field '${Path}'`
            : never
        : never;

type ToQueryResult<Transform> = Transform extends { toQuery?: (input: any, context: any) => infer Result }
    ? Result
    : never;

/**
 * A `customOperator` control stores the operator alongside the value, which
 * only a transform can turn into a condition — `buildHasuraConditions` throws
 * for both of these, so they are worth saying up front. `ConditionOnlyTransform`
 * is the type to annotate such a transform with.
 */
type CustomOperatorTransformError<Leaf, Control> =
    Control extends { type: 'customOperator' }
        ? Leaf extends { transform: infer Transform }
            ? [ToQueryResult<Transform>] extends [TransformConditionResult]
                ? never
                : "a 'customOperator' control needs a query transform that returns a condition"
            : "a 'customOperator' control needs a query transform"
        : never;

/**
 * `toQuery` is optional on `FilterTransform` — which is what lets the leaf
 * builders tell an omitted transform from a real one, see
 * filterExpr's `IsTransformed` — so a transform object carrying nothing at all
 * type-checks while doing nothing at query time, and would take the checks
 * below down with it.
 */
type EmptyTransformError<Leaf> = Leaf extends { transform: infer Transform }
    ? 'toQuery' extends keyof Transform ? never : 'a transform needs a toQuery function'
    : never;

type OperatorError<Type extends FilterLeafOperator, Path extends string, Value> =
    LeafHasuraOperator[Type] extends keyof HasuraOperatorFor<Value>
    ? never
    : `operator '${Type}' is not available for field '${Path}' (type ${DescribeType<Value>})`;

/**
 * A multiselect yields a list of values, which only `in`/`notIn` can consume —
 * unless the column itself is a list.
 */
type ListControlError<Type extends FilterLeafOperator, Path extends string, Value, Control extends FilterControl> =
    Control extends { type: 'multiselect' }
        ? Type extends 'in' | 'notIn' ? never
        : [Value] extends [readonly unknown[]] ? never
        : `control 'multiselect' produces a list of values for '${Path}'; use 'in' or 'notIn' rather than '${Type}'`
        : never;

/**
 * `customOperator` operators reach Hasura verbatim through the built-in
 * transform, so a recognised operator must be one the column supports.
 * Anything that is not a Hasura operator name is left to the transform.
 */
type CustomOperatorError<Path extends string, Value, Control extends FilterControl> =
    Control extends { type: 'customOperator'; operators: infer Operators }
        ? IsTuple<Operators> extends false ? never
        : Operators extends readonly { value: infer Operator }[]
            ? Operator extends string
                // Not a Hasura operator name: the transform gives it meaning.
                ? Operator extends keyof HasuraOperatorFor<any>
                    ? Operator extends keyof HasuraOperatorFor<Value>
                        ? never
                        : `operator '${Operator}' is not available for field '${Path}' (type ${DescribeType<Value>})`
                    : never
                : never
            : never
        : never;

// --- collecting the checks over a leaf's paths -----------------------------

/**
 * The type of the field at `Path`, with nullability removed — `never` when
 * nothing can be checked against it, either because the path does not exist
 * (`PathError` reports that) or because its type is opaque.
 */
type CheckableValue<Row, Path extends string> =
    PathValue<Row, Path> extends infer Raw
        ? [Raw] extends [never] ? never
        : Opaque<Raw> extends true ? never
        : NonNullable<Raw>
        : never;

type PathErrors<Row, Field> =
    PathsOf<Field>[number] extends infer Path
        ? Path extends string ? PathError<Row, Path> : never
        : never;

type ControlErrors<Row, Type extends FilterLeafOperator, Field, Control extends FilterControl> =
    PathsOf<Field>[number] extends infer Path
        ? Path extends string
            ? CheckableValue<Row, Path> extends infer Value
                ? [Value] extends [never] ? never
                : ControlError<Path, Value, Control> | ListControlError<Type, Path, Value, Control>
                : never
            : never
        : never;

type OperatorErrors<Row, Type extends FilterLeafOperator, Field> =
    PathsOf<Field>[number] extends infer Path
        ? Path extends string
            ? CheckableValue<Row, Path> extends infer Value
                ? [Value] extends [never] ? never : OperatorError<Type, Path, Value>
                : never
            : never
        : never;

type OperatorListErrors<Row, Field, Control extends FilterControl> =
    PathsOf<Field>[number] extends infer Path
        ? Path extends string
            ? CheckableValue<Row, Path> extends infer Value
                ? [Value] extends [never] ? never : CustomOperatorError<Path, Value, Control>
                : never
            : never
        : never;

// --- walking the expression ------------------------------------------------

type LeafErrors<Row, Leaf> =
    Leaf extends {
        type: infer Type extends FilterLeafOperator;
        field: infer Field;
        value: infer Control extends FilterControl;
    }
        ?
            | PathErrors<Row, Field>
            // A customOperator list is checked either way: the built-in
            // transform is what hands those operators to Hasura.
            | OperatorListErrors<Row, Field, Control>
            | CustomOperatorTransformError<Leaf, Control>
            | EmptyTransformError<Leaf>
            | (HasTransform<Leaf> extends true
                ? never
                : ControlErrors<Row, Type, Field, Control> | OperatorErrors<Row, Type, Field>)
        : never;

/**
 * Decrementing counter that bounds how far into and/or/not the walk goes.
 * Real filter trees are a few levels deep; the bound exists because during
 * inference the expression is still a type variable, and an unbounded walk
 * would recur until tsc gives up ("excessively deep").
 */
type NestingDepth = { 0: never; 1: 0; 2: 1; 3: 2; 4: 3; 5: 4; 6: 5; 7: 6; 8: 7 };

type ExprErrors<Row, Expr, Depth extends keyof NestingDepth = 8> =
    Depth extends 0 ? never
    : Expr extends { type: 'and' | 'or'; filters: infer Filters }
        ? Filters extends readonly unknown[]
            ? ExprErrors<Row, Filters[number], NestingDepth[Depth]>
            : never
        : Expr extends { type: 'not'; filter: infer Child }
            ? ExprErrors<Row, Child, NestingDepth[Depth]>
            : LeafErrors<Row, Expr>;

type Brand<Errors> = [Errors] extends [never] ? unknown : FilterTypeError<Extract<Errors, string>>;

/**
 * The checks above, addressed one argument at a time so that a row-scoped
 * builder (./filterExprForRow) can report each on the property that caused it
 * rather than on the whole `filter()` call. Each is `unknown` when it passes.
 */
export type ValidateOperatorForRow<Row, Type extends FilterLeafOperator, Field> =
    Brand<OperatorErrors<Row, Type, Field>>;

export type ValidateControlForRow<Row, Type extends FilterLeafOperator, Field, Control extends FilterControl> =
    Brand<ControlErrors<Row, Type, Field, Control> | OperatorListErrors<Row, Field, Control>>;

/** Only what still applies once a transform decides the value (see above). */
export type ValidateOperatorListForRow<Row, Field, Control extends FilterControl> =
    Brand<OperatorListErrors<Row, Field, Control>>;

/**
 * `unknown` when the field holds a `Value`, otherwise a `FilterTypeError`
 * saying what it holds instead. For a helper that only makes sense on one kind
 * of column — a numeric range, a text search — brand its field parameter with
 * this:
 *
 *     function numberRange<Row, const Field extends FilterFieldPath<Row>>(args: {
 *         rowType: Row;
 *         field: Field & ValidateFilterFieldType<Row, Field, number>;
 *     }) { ... }
 *
 * This resolves the type of the *one* field it is given. Selecting the row's
 * fields by type instead — enumerating every path and resolving each one —
 * costs work proportional to the size of the row, and exceeded TypeScript's
 * instantiation limit on real generated rows of ~900 lines. Every field of an
 * `and`/`or` group is checked, and nullability is ignored: filtering a nullable
 * column filters the values it does have.
 */
export type ValidateFilterFieldType<Row, Field, Value> = Brand<FieldTypeErrors<Row, Field, Value>>;

type FieldTypeErrors<Row, Field, Value> =
    PathsOf<Field>[number] extends infer Path
        ? Path extends string
            ? CheckableValue<Row, Path> extends infer Held
                ? [Held] extends [never] ? never
                : Accepts<Held, Value> extends true ? never
                : `field '${Path}' holds ${DescribeType<Held>}, and this filter needs ${DescribeType<Value>}`
                : never
            : never
        : never;

/**
 * `unknown` when `Expr` is a legal filter over `Row`, otherwise a
 * `FilterTypeError` naming what is wrong. Intended to be intersected with the
 * expression's own inferred type at the `filter()` boundary:
 *
 *     expression: Expr & ValidateFilterExprForRow<Row, Expr>
 *
 * The checks cannot be evaluated while `Row` is still a type parameter; there
 * they yield no errors rather than false ones, so a generic helper that builds
 * filters for a row type it hasn't been given yet keeps compiling. Constrain
 * such a helper's own arguments with `FilterFieldPath<Row>` to keep its
 * callers checked. See ./filters.
 */
export type ValidateFilterExprForRow<Row, Expr extends FilterExpr> = Brand<ExprErrors<Row, Expr>>;

/**
 * Type-level validation of the field a reusable column is given.
 *
 * A column written for one view names its fields as literals, and `column({
 * rowType })` checks them. A column shared between views often takes its
 * field from the caller instead — `accountColumn(rowType, 'arAccount')`. Its
 * renderer was written for one kind of value (an account, an amount, a flag),
 * so the caller's field has to hold that kind of value. `fieldColumn` (see
 * ./columns) builds such a column and checks the field with
 * `ValidateColumnFieldType`; a helper that takes the field from its own caller
 * brands its parameter the same way and hands it on:
 *
 *     function accountColumn<Row, const Field extends string>(
 *         rowType: Row,
 *         field: Field & ValidateColumnFieldType<Row, Field, Account | null>,
 *     ) { return fieldColumn({ rowType, field, ... }); }
 *
 * While `Row` is a type parameter the field cannot be looked up, so a field
 * handed on is accepted by its brand: one checked to hold `Value` goes where a
 * `Value` (or something wider, such as `Value | null`) is rendered, and nowhere
 * else (see `CheckedAs` in ./typeErrors). The brand also gives an inline
 * renderer, which declares no value type of its own, its `value`: `Account |
 * null` above.
 *
 * Filter helpers take their field the same way, with `ValidateFilterFieldType`.
 * Unlike there, nullability counts. A filter on a nullable
 * column filters the values it does have; a cell has to render the null too.
 * A field that can be null — itself, or because an object on its path can be —
 * is only accepted by a column whose `Value` admits null.
 *
 * The field has to be a literal path, or a field branded as above. A plain
 * `string`, or a helper's own `Field` that nothing has checked, cannot be
 * checked anywhere, so it is rejected rather than let through. A path that goes
 * through a list is rejected too, since the cell would get an array of values.
 *
 * The field is resolved as one path, not constrained by `FieldPath<Row>`:
 * enumerating every path of a generated row is costly, and when the constraint
 * fails tsc reports the whole union of paths instead of the one that is wrong.
 *
 * Failures surface as a `DslTypeError`, whose single property *name* is the
 * message, so tsc prints it verbatim at the call.
 *
 * Escape hatches, as for filters: a field typed `any` or `unknown` (json/jsonb
 * columns) and rows with an index signature accept anything.
 */
import type { ArrayQuery, Query, QueryForRowSafe } from '@kronor/hasura-graphql';
import type { Brand, CheckedAs, DescribeType, IsAny, NestingDepth, Opaque } from './typeErrors';

declare const throughList: unique symbol;
/** The value of a path that steps into a list: not a single value a cell can render. */
type ThroughList<List extends string> = { [throughList]: List };

/** null when the key can be missing: the cell reads a missing field as null. */
type MissingAsNull<Row, Key extends keyof Row> =
    undefined extends Row[Key] ? null
    : Partial<Pick<Row, Key>> extends Pick<Row, Key> ? null
    : never;

/**
 * The value a cell gets at a dotted path: the field's own type, plus null when
 * it or an object on the way can be null or missing (`undefined` never reaches
 * the cell, see `readPath` in ./columns). `never` when the path is not on the
 * row; `ThroughList` when it steps into a list; `unknown` on a row with an
 * index signature.
 */
export type ColumnFieldValue<Row, Path extends string, Prefix extends string = ''> =
    string extends keyof Row ? unknown
    : Path extends `${infer Head}.${infer Tail}`
        ? Head extends keyof Row
            ? NonNullable<Row[Head]> extends readonly unknown[]
                ? ThroughList<`${Prefix}${Head}`>
                : ColumnFieldValue<NonNullable<Row[Head]>, Tail, `${Prefix}${Head}.`> extends infer Inner
                    ? [Inner] extends [never] ? never
                    : Inner extends ThroughList<string> ? Inner
                    : Inner | (null extends Row[Head] ? null : never) | MissingAsNull<Row, Head>
                    : never
            : never
        : Path extends keyof Row ? Exclude<Row[Path], undefined> | MissingAsNull<Row, Path> : never;

type Nullish = null | undefined;

type FieldErrors<Row, Field extends string, Value> =
    string extends Field
        ? `the field must be a literal path; a helper takes it as 'Field & ValidateColumnFieldType<Row, Field, Value>'`
    : string extends keyof Row ? never
    : ColumnFieldValue<Row, Field> extends infer Held
        ? Opaque<Held> extends true ? never
        : [Held] extends [never] ? `field '${Field}' is not on the row`
        : [Held] extends [ThroughList<infer List>] ? `field '${Field}' goes through the list '${List}'; select the list instead`
        : [Held] extends [Value] ? never
        : [Exclude<Held, Nullish>] extends [Value]
            ? `field '${Field}' can be null, and this column does not render null`
            : `field '${Field}' holds ${DescribeType<Exclude<Held, Nullish>>}, and this column renders ${DescribeType<Exclude<Value, Nullish>>}`
        : never;

/**
 * `unknown` when the field at `Field` holds a `Value` (nullability included),
 * otherwise a `DslTypeError` saying what it holds instead. While `Row` is a
 * type parameter, a brand checked against a narrower `Value` (see above).
 */
export type ValidateColumnFieldType<Row, Field extends string, Value> =
    [Row, Field] extends [infer R, infer F extends string] ? Brand<FieldErrors<R, F, Value>> : CheckedAs<Value>;

type ListElement<Value> = NonNullable<Value> extends readonly (infer Element)[] ? NonNullable<Element> : never;

/** The arguments a list selection takes besides its selection set. */
type ListArguments = Pick<ArrayQuery, 'orderBy' | 'distinctOn' | 'limit' | 'where'>;

/** What `fieldColumn` can select inside its field, unchecked: see `FieldColumnSelect`. */
export type FieldSelection =
    | { object: readonly Query[] }
    | ({ list: readonly Query[] } & ListArguments);

/**
 * What `fieldColumn` selects inside its field, decided by the value its
 * renderer takes: nothing for a scalar, the object's fields for an object, and
 * the element's fields (plus the list arguments) for a list. The selection is
 * checked against `Value`, which is itself checked against the row.
 */
export type FieldColumnSelect<Value> =
    IsAny<Value> extends true ? { select?: undefined }
    : [NonNullable<Value>] extends [readonly unknown[]]
        ? { select: { list: readonly QueryForRowSafe<ListElement<Value>>[] } & ListArguments }
    : [NonNullable<Value>] extends [object]
        ? { select: { object: readonly QueryForRowSafe<NonNullable<Value>>[] } }
    : { select?: undefined };

/**
 * The scalar paths inside an object, through nested objects but not lists:
 * what a selection of it can be ordered by.
 */
type ScalarPaths<Value, Depth extends keyof NestingDepth = 4> =
    Opaque<Value> extends true ? string
    : {
        [K in Extract<keyof Value, string>]:
            Opaque<Value[K]> extends true ? K
            : [NonNullable<Value[K]>] extends [readonly unknown[]] ? never
            : [NonNullable<Value[K]>] extends [Date] ? K
            : [NonNullable<Value[K]>] extends [object]
                ? Depth extends 0 ? never : `${K}.${ScalarPaths<NonNullable<Value[K]>, NestingDepth[Depth]>}`
            : K;
    }[Extract<keyof Value, string>];

/**
 * What a `fieldColumn` can be ordered by: the field itself when it holds a
 * scalar, a scalar inside it when it holds an object (`'arAccount.accountNr'`),
 * nothing when it holds a list. The path still has to be one the column
 * selects, which is checked when the column is built.
 */
export type FieldColumnOrderBy<Field extends string, Value> =
    Opaque<Value> extends true ? string
    : [NonNullable<Value>] extends [readonly unknown[]] ? never
    : [NonNullable<Value>] extends [Date] ? Field
    : [NonNullable<Value>] extends [object] ? `${Field}.${ScalarPaths<NonNullable<Value>>}`
    : Field;

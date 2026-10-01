/**
 * Shared machinery of the DSL's type-level checks (./filterTyping,
 * ./columnTyping, ./filterExpr). Only `DslTypeError` is part of the public API;
 * the rest is internal to the checks.
 */

/**
 * A failed check. The message is the property name so that tsc reports
 * "Property '<message>' is missing ..." instead of a structural diff.
 */
export type DslTypeError<Message extends string> = { [K in Message]: never };

/** `unknown` when there are no errors, otherwise a `DslTypeError` carrying them. */
export type Brand<Errors> = [Errors] extends [never] ? unknown : DslTypeError<Extract<Errors, string>>;

declare const checkedAs: unique symbol;

/**
 * The unreachable branch of a field validator (`ValidateColumnFieldType`,
 * `ValidateFilterFieldType`), there only for the variance of `Value`:
 *
 *     export type ValidateXFieldType<Row, Field, Value> =
 *         [Row, Field] extends [infer R, infer F] ? Brand<Errors<R, F, Value>> : CheckedAs<Value>;
 *
 * Inside a helper the row is a type parameter and the errors cannot be
 * evaluated, so a field one helper hands on to another is compared by its
 * brand alone: one checked to hold `Account` is accepted where one holding
 * `Account | null` is asked for, and not where `string` is. TypeScript compares
 * the two brands' type arguments by the variance it measures for each, and the
 * unevaluated errors measure as independent of `Value` — on their own they
 * would let any brand through. `infer` always matches, so this branch is never
 * taken; it makes `Value` measure as covariant.
 *
 * Two details are load-bearing, and pinned down by the forwarding tests in
 * columnTyping.rowTyping.test.ts and filters.rowTyping.test.ts. The errors are
 * written against the inferred `R` and `F`: against `Row` and `Field`, a field
 * handed on without naming the type arguments is not recognised. And the
 * conditional is written out in each validator: behind a shared generic alias,
 * tsc resolves it early and the branch is lost.
 */
export type CheckedAs<Value> = { readonly [checkedAs]: Value };

export type IsAny<T> = 0 extends 1 & T ? true : false;

/** Value types nothing can be concluded from: json/jsonb columns, widened rows. */
export type Opaque<Value> = IsAny<Value> extends true ? true : unknown extends Value ? true : false;

/** Non-distributive so that literal unions (Hasura enums) describe as one word. */
export type DescribeType<Value> =
    [Value] extends [string] ? 'string'
    : [Value] extends [number] ? 'number'
    : [Value] extends [boolean] ? 'boolean'
    : [Value] extends [Date] ? 'Date'
    : [Value] extends [readonly unknown[]] ? 'a list'
    : [Value] extends [object] ? 'an object'
    : 'unknown';

/** Decrementing counter that bounds type-level recursion. */
export type NestingDepth = { 0: never; 1: 0; 2: 1; 3: 2; 4: 3; 5: 4; 6: 5; 7: 6; 8: 7 };

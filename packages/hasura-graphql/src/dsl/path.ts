// Dotted field paths over a row type, and the value type each path resolves to.

type StringKeyOf<Row> = Extract<keyof Row, string>;
type UnwrapArray<T> = T extends readonly (infer E)[] ? E : T;
type NextPathTarget<T> = UnwrapArray<NonNullable<T>>;

/** Decrementing counter that bounds path recursion depth. */
export type PathDepth = {
    0: never;
    1: 0;
    2: 1;
    3: 2;
    4: 3;
    5: 4;
    6: 5;
    7: 6;
    8: 7;
    9: 8;
    10: 9;
};

type ShouldRecurse<T> =
    T extends object
        ? T extends (...args: never[]) => unknown
            ? false
            : T extends Date
                ? false
                : true
        : false;

/**
 * All valid dotted field paths for a given row type.
 *
 * Examples:
 * - "id"
 * - "customer.email"
 * - "lines.sku" (arrays are traversed via their element type)
 */
export type FieldPath<Row, Depth extends keyof PathDepth = 10> =
    // If Row is too wide (e.g. generic object), we can't enumerate paths.
    string extends keyof Row
        ? string
        : {
              [K in StringKeyOf<Row>]:
                  ShouldRecurse<NextPathTarget<Row[K]>> extends true
                      ? Depth extends 0
                          ? K
                          : K | `${K}.${FieldPath<NextPathTarget<Row[K]>, PathDepth[Depth]>}`
                      : K;
          }[StringKeyOf<Row>];

type PropValue<Row, Key extends string> =
    // If Row is too wide (e.g. generic object), we can't safely resolve path values.
    string extends keyof Row
        ? unknown
        : Key extends keyof Row
            ? Row[Key]
            : never;

/**
 * Whether a dotted path may continue past a value: into the values `FieldPath`
 * recurses into, and into `any` (a json/jsonb column). A string or a number
 * has keys too (`length`, `toFixed`), but no fields Hasura can filter on.
 */
type CanStepInto<T> = 0 extends 1 & T ? true : [ShouldRecurse<T>] extends [true] ? true : false;

/**
 * Resolve the (possibly nullable) value type at a dotted field path.
 *
 * Examples:
 * - PathValue<Row, "id"> => Row["id"]
 * - PathValue<Row, "customer.email"> => Row["customer"]["email"] (with nullables preserved)
 * - Arrays are traversed via their element type.
 * - PathValue<Row, "id.length"> => never: a path does not step into a scalar.
 */
export type PathValue<Row, Path extends string> =
    string extends keyof Row
        ? unknown
        : Path extends `${infer Head}.${infer Tail}`
            ? NextPathTarget<PropValue<Row, Head>> extends infer Next
                ? CanStepInto<Next> extends true ? PathValue<Next, Tail> : never
                : never
            : PropValue<Row, Path>;

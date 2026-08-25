export type UnionToIntersection<U> = (
    U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
    ? I
    : never;

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type EmptyObject = Record<never, never>;

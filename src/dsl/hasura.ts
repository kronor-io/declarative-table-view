import { Hasura } from '../framework/graphql';
import type { HasuraFilterExpression, HasuraOperatorFor, HasuraComparable } from '../framework/graphql';
import type { FilterFieldPath, PathValue } from './filters';

type OperatorForPath<Row, Path extends FilterFieldPath<Row>> = HasuraOperatorFor<PathValue<Row, Path>>;

type NonNull<T> = Exclude<T, null | undefined>;

type IsScopeableValue<T> =
    T extends (...args: never[]) => unknown
        ? false
        : T extends Date
            ? false
            : T extends readonly (infer E)[]
                ? NonNull<E> extends object
                    ? true
                    : false
                : T extends object
                    ? true
                    : false;

type ScopePath<Row> =
    string extends keyof Row
        ? string
        : {
              [P in FilterFieldPath<Row>]: IsScopeableValue<NonNull<PathValue<Row, P>>> extends true ? P : never;
          }[FilterFieldPath<Row>];

type ScopeTargetRow<V> =
    V extends readonly (infer E)[]
        ? NonNull<E>
        : NonNull<V>;

type Exact<Actual, Expected> =
    Actual & Record<Exclude<keyof Actual, keyof Expected>, never>;

// Typed wrapper for building Hasura filter expressions against a Row shape.
// This is intended for transforms that produce `{ condition }` results.
export type HasuraForRow<Row> = {
    empty: () => HasuraFilterExpression;
    and: (...items: HasuraFilterExpression[]) => HasuraFilterExpression;
    or: (...items: HasuraFilterExpression[]) => HasuraFilterExpression;
    not: (item: HasuraFilterExpression) => HasuraFilterExpression;
    scope: <const Path extends ScopePath<Row>>(
        path: Path,
        build: (scoped: HasuraForRow<ScopeTargetRow<PathValue<Row, Path>>>) => HasuraFilterExpression
    ) => HasuraFilterExpression;
    condition: <
        const Path extends FilterFieldPath<Row>,
        Op extends OperatorForPath<Row, Path>
    >(
        path: Path,
        operator:
            | Exact<Op, OperatorForPath<Row, Path>>
            | Array<Exact<Op, OperatorForPath<Row, Path>>>
    ) => HasuraFilterExpression;

    // Operator helpers (generic where possible)
    eq: <T>(value: T) => HasuraOperatorFor<T>;
    neq: <T>(value: T) => HasuraOperatorFor<T>;
    gt: <T extends HasuraComparable>(value: T) => { _gt: T };
    lt: <T extends HasuraComparable>(value: T) => { _lt: T };
    gte: <T extends HasuraComparable>(value: T) => { _gte: T };
    lte: <T extends HasuraComparable>(value: T) => { _lte: T };
    in: <T>(value: ReadonlyArray<NonNullable<T>>) => { _in: ReadonlyArray<NonNullable<T>> };
    nin: <T>(value: ReadonlyArray<NonNullable<T>>) => { _nin: ReadonlyArray<NonNullable<T>> };
    like: (value: string) => { _like: string };
    ilike: (value: string) => { _ilike: string };
    isNull: (value: boolean) => { _isNull: boolean };
    similar: (value: string) => { _similar: string };
    nsimilar: (value: string) => { _nsimilar: string };
    regex: (value: string) => { _regex: string };
    nregex: (value: string) => { _nregex: string };
    iregex: (value: string) => { _iregex: string };
    niregex: (value: string) => { _niregex: string };
};

export function hasuraDSLforRowType<Row>(): HasuraForRow<Row>;
export function hasuraDSLforRowType<Row>(_rowType: Row): HasuraForRow<Row>;
export function hasuraDSLforRowType<Row>(_rowType?: Row): HasuraForRow<Row> {
    void _rowType;

    const scope: HasuraForRow<Row>['scope'] = (<const Path extends ScopePath<Row>>(
        path: Path,
        build: (scoped: HasuraForRow<ScopeTargetRow<PathValue<Row, Path>>>) => HasuraFilterExpression
    ): HasuraFilterExpression => {
        const scoped = hasuraDSLforRowType() as unknown as HasuraForRow<ScopeTargetRow<PathValue<Row, Path>>>;
        return Hasura.scope(path, build(scoped));
    }) as HasuraForRow<Row>['scope'];

    return {
        empty: Hasura.empty,
        and: Hasura.and,
        or: Hasura.or,
        not: Hasura.not,
        scope,
        condition: <
            const Path extends FilterFieldPath<Row>,
            Op extends OperatorForPath<Row, Path>
        >(
            path: Path,
            operator: Exact<Op, OperatorForPath<Row, Path>> | Array<Exact<Op, OperatorForPath<Row, Path>>>
        ): HasuraFilterExpression => Hasura.condition(path, operator),

        eq: <T,>(value: T): HasuraOperatorFor<T> => ({ _eq: value }),
        neq: <T,>(value: T): HasuraOperatorFor<T> => ({ _neq: value }),
        gt: <T extends HasuraComparable>(value: T): { _gt: T } => ({ _gt: value }),
        lt: <T extends HasuraComparable>(value: T): { _lt: T } => ({ _lt: value }),
        gte: <T extends HasuraComparable>(value: T): { _gte: T } => ({ _gte: value }),
        lte: <T extends HasuraComparable>(value: T): { _lte: T } => ({ _lte: value }),
        in: <T,>(value: ReadonlyArray<NonNullable<T>>): { _in: ReadonlyArray<NonNullable<T>> } => ({ _in: value }),
        nin: <T,>(value: ReadonlyArray<NonNullable<T>>): { _nin: ReadonlyArray<NonNullable<T>> } => ({ _nin: value }),
        like: (value: string): { _like: string } => ({ _like: value }),
        ilike: (value: string): { _ilike: string } => ({ _ilike: value }),
        isNull: (value: boolean): { _isNull: boolean } => ({ _isNull: value }),
        similar: (value: string): { _similar: string } => ({ _similar: value }),
        nsimilar: (value: string): { _nsimilar: string } => ({ _nsimilar: value }),
        regex: (value: string): { _regex: string } => ({ _regex: value }),
        nregex: (value: string): { _nregex: string } => ({ _nregex: value }),
        iregex: (value: string): { _iregex: string } => ({ _iregex: value }),
        niregex: (value: string): { _niregex: string } => ({ _niregex: value }),
    };
}

export default hasuraDSLforRowType;

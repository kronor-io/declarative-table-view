// Compiles DTV filter state into Hasura filter expressions.
//
// The expression algebra itself lives in @kronor/hasura-graphql; this module
// is the part that knows about DTV's filter schema, form state and transforms.
import type { FilterField, FilterGroups, FilterExpr, TransformResult, TransformConditionResult, ConditionOnlyTransform, QueryTransformContext } from '../filters';
import { FilterFormState, traverseFilterSchemaAndState } from '../filter-form-state';
import { FilterState } from '../state';
import { getAllFilters } from '../view';
import * as FilterValue from '../filterValue';
import { Hasura } from '@kronor/hasura-graphql';
import type { HasuraFilterExpression, HasuraOperator } from '@kronor/hasura-graphql';

type CustomOperatorStateValue = {
    operator: string;
    value: FilterValue.FilterValue;
};

function buildHasuraCondition(field: FilterField, operator: HasuraOperator | HasuraOperator[]): TransformConditionResult {
    if (typeof field === 'object') {
        if ('and' in field) {
            return { condition: Hasura.and(...field.and.map(fieldName => Hasura.condition(fieldName, operator))) };
        }
        if ('or' in field) {
            return { condition: Hasura.or(...field.or.map(fieldName => Hasura.condition(fieldName, operator))) };
        }
    }

    return typeof field === 'string'
        ? { condition: Hasura.condition(field, operator) }
        : { condition: Hasura.empty() };
}

export const hasuraCustomOperatorTransform: ConditionOnlyTransform = {
    toQuery: (input: unknown, context: QueryTransformContext) => {
        const { operator, value } = input as CustomOperatorStateValue;

        return FilterValue.match({
            empty: { condition: Hasura.empty() },
            value: (queryValue: unknown) => buildHasuraCondition(context.field, { [operator]: queryValue })
        }, value);
    }
};

function isEmptyQueryValue(value: unknown): boolean {
    return (
        value === undefined ||
        value === '' ||
        value === null ||
        (Array.isArray(value) && value.length === 0)
    );
}

// Build Hasura filter expression from FilterFormState and FilterFieldSchema using schema-driven approach
export function buildHasuraConditions(
    filterState: FilterState,
    filterGroups: FilterGroups
): HasuraFilterExpression {
    const filtersById = new Map(getAllFilters(filterGroups)
        .map(filterSchema => [filterSchema.id, filterSchema] as const));

    function buildNestedKey(field: FilterField, operator: HasuraOperator | HasuraOperator[]): HasuraFilterExpression {
        if (typeof field === 'object') {
            if ('and' in field) {
                return Hasura.and(...field.and.map(fieldName => Hasura.condition(fieldName, operator)));
            }
            if ('or' in field) {
                return Hasura.or(...field.or.map(fieldName => Hasura.condition(fieldName, operator)));
            }
        }
        if (typeof field === 'string') {
            return Hasura.condition(field, operator);
        }
        return Hasura.empty();
    }

    function buildConditionsRecursive(
        schemaNode: FilterExpr,
        stateNode: FilterFormState
    ): HasuraFilterExpression | null {
        return traverseFilterSchemaAndState(
            schemaNode,
            stateNode,
            {
                leaf: (schema, state): HasuraFilterExpression | null => {
                    const baseValue = state.value;
                    return FilterValue.match({
                        empty: null,
                        value: (filterValue: unknown) => {
                            const transform = schema.transform?.toQuery;

                            if (schema.value.type === 'customOperator' && !transform) {
                                throw new Error('customOperator filters require a query transform');
                            }

                            const transformContext: QueryTransformContext = {
                                field: schema.field,
                                FilterValue,
                                transform: { hasuraCustomOperator: hasuraCustomOperatorTransform },
                            };

                            const transformResult: TransformResult =
                                transform
                                    ? transform(filterValue, transformContext)
                                    : { field: schema.field, value: baseValue };

                            if ('condition' in transformResult) {
                                return transformResult.condition;
                            }

                            if (schema.value.type === 'customOperator') {
                                throw new Error('customOperator query transforms must return a condition');
                            }

                            const transformedValue = transformResult.value;

                            return FilterValue.match({
                                empty: null,
                                value: (value: unknown) => {
                                    const field = transformResult.field ?? schema.field;

                                    if (isEmptyQueryValue(value)) return null;

                                    const opMap: Record<string, string> = {
                                        equals: '_eq',
                                        notEquals: '_neq',
                                        greaterThan: '_gt',
                                        lessThan: '_lt',
                                        greaterThanOrEqual: '_gte',
                                        lessThanOrEqual: '_lte',
                                        in: '_in',
                                        notIn: '_nin',
                                        like: '_like',
                                        iLike: '_ilike',
                                        isNull: '_isNull',
                                    };
                                    const op = opMap[schema.type];
                                    if (!op) return null;

                                    return buildNestedKey(field, { [op]: value });
                                }
                            }, transformedValue);
                        }
                    }, baseValue)
                },
                and: (_schema, _state, childResults): HasuraFilterExpression | null => {
                    const validChildren = childResults.filter((c): c is HasuraFilterExpression => c !== null);
                    if (validChildren.length === 0) return null;
                    return Hasura.and(...validChildren);
                },
                or: (_schema, _state, childResults): HasuraFilterExpression | null => {
                    const validChildren = childResults.filter((c): c is HasuraFilterExpression => c !== null);
                    if (validChildren.length === 0) return null;
                    return Hasura.or(...validChildren);
                },
                not: (_schema, _state, childResult): HasuraFilterExpression | null => {
                    return childResult ? Hasura.not(childResult) : null;
                }
            }
        );
    }

    const conditions: HasuraFilterExpression[] = [];
    for (const [filterId, formState] of filterState.entries()) {
        const filterDef = filtersById.get(filterId);
        if (!filterDef) continue;
        const condition = buildConditionsRecursive(filterDef.expression, formState);
        if (condition) {
            conditions.push(condition);
        }
    }
    if (conditions.length === 0) return Hasura.empty();
    if (conditions.length === 1) return conditions[0];
    return Hasura.and(...conditions);
}

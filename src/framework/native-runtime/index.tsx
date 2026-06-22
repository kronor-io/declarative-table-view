import { PhoneNumberFilter } from '../../components/PhoneNumberFilter';
import NoRowsExtendDateRange from '../../views/payment-requests/components/NoRowsExtendDateRange';
import { Runtime } from '../runtime';
import { CellRenderer, FieldQuery, TableColumnDefinition } from '../column-definition';
import { ConditionOnlyTransform, FilterField, FilterTransform, QueryTransformContext, TransformConditionResult, TransformResult } from '../filters';
import * as FilterValue from '../filterValue';
import { Hasura } from '../graphql';
import type { HasuraOperator } from '../graphql';

export type NativeRuntime = Runtime & {
    cellRenderers: {
        text: (props: { data: unknown; columnDefinition: TableColumnDefinition }) => string;
        json: (props: { data: unknown }) => string;
    };
};

type CustomOperatorStateValue = {
    operator: string;
    value: FilterValue.FilterValue;
};

export function mapHasuraCustomOperatorInput(
    input: unknown,
    mapValue: (operator: string, value: unknown) => unknown
): unknown {
    if (!input || typeof input !== 'object') {
        return input;
    }

    const record = input as { operator?: unknown; value?: unknown };
    if (typeof record.operator !== 'string' || !FilterValue.isValue(record.value as FilterValue.FilterValue)) {
        return input;
    }

    const operator = record.operator;

    return FilterValue.match({
        empty: input,
        value: (value: unknown) => ({
            operator,
            value: FilterValue.value(mapValue(operator, value))
        })
    }, record.value as FilterValue.FilterValue);
}

function buildHasuraCondition(field: FilterField, operator: HasuraOperator | HasuraOperator[]): TransformConditionResult {
    if (typeof field === 'object') {
        if ('and' in field) {
            return TransformResult.condition(Hasura.and(...field.and.map(fieldName => Hasura.condition(fieldName, operator))));
        }
        if ('or' in field) {
            return TransformResult.condition(Hasura.or(...field.or.map(fieldName => Hasura.condition(fieldName, operator))));
        }
    }

    return typeof field === 'string'
        ? TransformResult.condition(Hasura.condition(field, operator))
        : TransformResult.condition(Hasura.empty());
}

export const hasuraCustomOperatorTransform: ConditionOnlyTransform = {
    toQuery: (input: unknown, context: QueryTransformContext) => {
        const { operator, value } = input as CustomOperatorStateValue;

        return FilterValue.match({
            empty: TransformResult.condition(Hasura.empty()),
            value: (queryValue: unknown) => buildHasuraCondition(context.field, { [operator]: queryValue })
        }, value);
    }
};

function traverseFieldQuery(queryNode: FieldQuery, dataNode: any): string {
    switch (queryNode.type) {
        case 'valueQuery': {
            if (dataNode == null) return '';
            const leaf = dataNode[queryNode.field];
            return leaf != null ? String(leaf) : '';
        }
        case 'objectQuery': {
            if (queryNode.selectionSet.length !== 1) return '';
            const childQuery = queryNode.selectionSet[0];
            const nextData = dataNode?.[queryNode.field];
            return traverseFieldQuery(childQuery, nextData);
        }
        default:
            return '';
    }
};

export const cellRenderers = {
    text: ({ data, columnDefinition }) => {
        const dataQuery: FieldQuery = columnDefinition.data[0];

        if (dataQuery == null || columnDefinition.data.length !== 1) return '';

        if (typeof data !== 'object' || data === null) return '';
        return traverseFieldQuery(dataQuery, data);
    },

    json: ({ data }) => JSON.stringify(data)
} satisfies Record<string, CellRenderer>

export const filterTransforms = {
    autocomplete: {
        toQuery: (input: any) => {
            if (!input) {
                return TransformResult.empty();
            }
            return TransformResult.value(input.value);
        }
    },

    autocompleteMultiple: {
        toQuery: (input: any) => {
            if (!input) {
                return TransformResult.empty();
            }
            return TransformResult.value(input.map((item: any) => item.value));
        }
    },

    hasuraCustomOperator: hasuraCustomOperatorTransform
} satisfies Record<string, FilterTransform>

export const nativeRuntime: NativeRuntime = {
    cellRenderers: cellRenderers as any,
    queryTransforms: filterTransforms as any,
    noRowsComponents: {
        noRowsExtendDateRange: NoRowsExtendDateRange
    },
    customFilterComponents: {
        PhoneNumberFilter
    },
    initialValues: {},
    suggestionFetchers: {}
};

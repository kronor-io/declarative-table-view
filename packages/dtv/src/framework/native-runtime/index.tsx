import { PhoneNumberFilter } from '../../components/PhoneNumberFilter';
import { isQueryablePhoneNumber } from '../../components/phoneNumber';
import NoRowsExtendDateRange from '../../views/payment-requests/components/NoRowsExtendDateRange';
import { Runtime } from '../runtime';
import { CellRenderer, FieldQuery, TableColumnDefinition } from '../column-definition';
import { FilterTransform, TransformResult } from '../filters';
import * as FilterValue from '../filterValue';
import { hasuraCustomOperatorTransform } from '../graphql';

export { hasuraCustomOperatorTransform };

export type NativeRuntime = Runtime & {
    cellRenderers: {
        text: (props: { data: unknown; columnDefinition: TableColumnDefinition }) => string;
        json: (props: { data: unknown }) => string;
    };
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

    hasuraCustomOperator: hasuraCustomOperatorTransform,

    // Drops phone values too short to cast, such as a bare "+46" saved by older PhoneNumberFilter versions.
    phoneNumber: {
        toQuery: (input: unknown) => {
            if (typeof input !== 'string' || !isQueryablePhoneNumber(input)) {
                return TransformResult.empty();
            }
            return TransformResult.value(input.trim());
        }
    }
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

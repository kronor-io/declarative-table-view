import { PhoneNumberFilter } from '../../components/PhoneNumberFilter';
import NoRowsExtendDateRange from '../../views/payment-requests/components/NoRowsExtendDateRange';
import { Runtime } from '../runtime';
import { FieldQuery, TableColumnDefinition } from '../column-definition';

export type NativeRuntime = Runtime & {
    cellRenderers: {
        text: (props: { data: unknown; columnDefinition: TableColumnDefinition }) => string;
        json: (props: { data: unknown }) => string;
    };
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

export const nativeRuntime: NativeRuntime = {
    cellRenderers: {
        text: ({ data, columnDefinition }) => {
            const dataQuery: FieldQuery = columnDefinition.data[0];

            if (dataQuery == null || columnDefinition.data.length !== 1) return '';

            if (typeof data !== 'object' || data === null) return '';
            return traverseFieldQuery(dataQuery, data);
        },

        json: ({ data }) => JSON.stringify(data),
    },
    queryTransforms: {
        autocomplete: {
            toQuery: (input: any) => {
                if (input) {
                    return { value: input.value };
                }
                return { value: input };
            }
        },

        autocompleteMultiple: {
            toQuery: (input: any) => {
                if (input) {
                    return { value: input.map((item: any) => item.value) };
                }
                return { value: input };
            }
        }
    },
    noRowsComponents: {
        noRowsExtendDateRange: NoRowsExtendDateRange
    },
    customFilterComponents: {
        PhoneNumberFilter
    },
    initialValues: {},
    suggestionFetchers: {}
};

import { PhoneNumberFilter } from '../../components/PhoneNumberFilter';
import NoRowsExtendDateRange from '../../views/payment-requests/components/NoRowsExtendDateRange';
import { Runtime } from '../runtime';

export type NativeRuntime = Runtime & {
    cellRenderers: {
        text: ({ data }: { data: unknown }) => string;
        json: ({ data }: { data: unknown }) => string;
    };
};

export const nativeRuntime: NativeRuntime = {
    cellRenderers: {
        text: ({ data }) => typeof data === 'object' && data !== null ? Object.values(data)[0].toString() : String(data),
        json: ({ data }) => JSON.stringify(data),
    },
    queryTransforms: {},
    noRowsComponents: {
        noRowsExtendDateRange: NoRowsExtendDateRange
    },
    customFilterComponents: {
        PhoneNumberFilter
    },
    initialValues: {}
};

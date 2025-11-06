
import { Runtime } from '@kronor/dtv';

export const runtime: Runtime = {
    cellRenderers: {},

    queryTransforms: {
        genericTextFilter: {
            toQuery: (input: any) => {
                if (input.operator === '_like' && input.value) {
                    return { value: { ...input, value: `${input.value}%` } };
                }
                return { value: input };
            },
        },
    },
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
};

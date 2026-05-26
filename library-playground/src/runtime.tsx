
import { hasuraCustomOperatorTransform, mapHasuraCustomOperatorInput, type QueryTransformContext } from '../../src/lib';

export const runtime = {
    cellRenderers: {},

    queryTransforms: {
        emailCustom: {
            toQuery: (input: unknown, context: QueryTransformContext) => hasuraCustomOperatorTransform.toQuery(
                mapHasuraCustomOperatorInput(input, (operator, value) =>
                    operator === '_like' && typeof value === 'string' ? `${value}%` : value
                ),
                context
            )
        },
    },
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {},
    suggestionFetchers: {},
};

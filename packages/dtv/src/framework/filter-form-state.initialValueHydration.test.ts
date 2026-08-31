import { parseFilterFormState, serializeFilterFormStateMap } from './filter-form-state';
import type { FilterGroups } from './filters';
import { createDefaultFilterState, FormStateInitMode } from './state';
import * as FilterValue from './filterValue';

const statusOnly: FilterGroups = [
    {
        name: 'default',
        label: null,
        filters: [
            {
                id: 'status',
                label: 'Status',
                expression: { type: 'equals', field: 'status', value: { type: 'text', initialValue: 'PAID' } },
                aiGenerated: false
            }
        ]
    }
];

const statusAndMerchant: FilterGroups = [
    {
        name: 'default',
        label: null,
        filters: [
            ...statusOnly[0].filters,
            {
                id: 'merchant',
                label: 'Merchant',
                expression: { type: 'equals', field: 'merchant', value: { type: 'text', initialValue: 'acme' } },
                aiGenerated: false
            }
        ]
    }
];

const dateRange = (childCount: 2 | 3): FilterGroups => [
    {
        name: 'default',
        label: null,
        filters: [
            {
                id: 'date-range',
                label: 'Date Range',
                expression: {
                    type: 'and',
                    filters: [
                        { type: 'greaterThanOrEqual', field: 'createdAt', value: { type: 'date', initialValue: new Date('2026-07-01T00:00:00.000Z') } },
                        { type: 'lessThanOrEqual', field: 'createdAt', value: { type: 'date', initialValue: new Date('2026-08-01T00:00:00.000Z') } },
                        ...(childCount === 3
                            ? [{ type: 'equals' as const, field: 'currency', value: { type: 'text' as const, initialValue: 'SEK' } }]
                            : [])
                    ]
                },
                aiGenerated: false
            }
        ]
    }
];

describe('parseFilterFormState missing-filter hydration', () => {
    it('hydrates a filter absent from the payload with its schema initialValue under WithInitialValues', () => {
        // State persisted before `merchant` existed on the view.
        const persisted = serializeFilterFormStateMap(createDefaultFilterState(statusOnly), statusOnly);
        expect(persisted).not.toHaveProperty('merchant');

        const hydrated = parseFilterFormState(persisted, statusAndMerchant, FormStateInitMode.WithInitialValues);

        expect(hydrated.get('status')).toEqual({ type: 'leaf', value: FilterValue.value('PAID') });
        expect(hydrated.get('merchant')).toEqual({ type: 'leaf', value: FilterValue.value('acme') });
    });

    it('defaults to Empty so snapshot consumers reproduce exactly what was captured', () => {
        const persisted = serializeFilterFormStateMap(createDefaultFilterState(statusOnly), statusOnly);

        const hydrated = parseFilterFormState(persisted, statusAndMerchant);

        expect(hydrated.get('merchant')).toEqual({ type: 'leaf', value: FilterValue.empty });
    });

    it('keeps an explicitly cleared leaf empty even under WithInitialValues', () => {
        const schema = dateRange(2);
        const state = createDefaultFilterState(schema);
        // User cleared only the "to" date; the filter as a whole is still non-empty, so it
        // is persisted with an explicit empty leaf that must survive the round trip.
        state.set('date-range', {
            type: 'and',
            children: [
                { type: 'leaf', value: FilterValue.value(new Date('2026-07-01T00:00:00.000Z')) },
                { type: 'leaf', value: FilterValue.empty }
            ]
        });

        const persisted = serializeFilterFormStateMap(state, schema);
        const hydrated = parseFilterFormState(persisted, schema, FormStateInitMode.WithInitialValues);

        expect(hydrated.get('date-range')).toEqual({
            type: 'and',
            children: [
                { type: 'leaf', value: FilterValue.value(new Date('2026-07-01T00:00:00.000Z')) },
                { type: 'leaf', value: FilterValue.empty }
            ]
        });
    });
});

describe('parseFilterFormState schema shape drift', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('falls back instead of returning a state tree narrower than the schema', () => {
        const persisted = serializeFilterFormStateMap(createDefaultFilterState(dateRange(2)), dateRange(2));

        const hydrated = parseFilterFormState(persisted, dateRange(3), FormStateInitMode.WithInitialValues);

        // A 2-child state against a 3-child schema throws at render time in FilterForm,
        // so rehydration must reject it and fall back to a schema-shaped state.
        expect(hydrated.get('date-range')).toEqual(
            createDefaultFilterState(dateRange(3)).get('date-range')
        );
        expect(warnSpy).toHaveBeenCalled();
    });

    it('falls back instead of throwing when a filter expression lost a child', () => {
        const persisted = serializeFilterFormStateMap(createDefaultFilterState(dateRange(3)), dateRange(3));

        const hydrated = parseFilterFormState(persisted, dateRange(2), FormStateInitMode.WithInitialValues);

        expect(hydrated.get('date-range')).toEqual(
            createDefaultFilterState(dateRange(2)).get('date-range')
        );
    });

    it('drops only the drifted filter, leaving its siblings intact', () => {
        const schema: FilterGroups = [
            { name: 'default', label: null, filters: [...dateRange(3)[0].filters, ...statusOnly[0].filters] }
        ];
        const persistedSchema: FilterGroups = [
            { name: 'default', label: null, filters: [...dateRange(2)[0].filters, ...statusOnly[0].filters] }
        ];
        const persisted = serializeFilterFormStateMap(createDefaultFilterState(persistedSchema), persistedSchema);

        const hydrated = parseFilterFormState(persisted, schema, FormStateInitMode.WithInitialValues);

        expect(hydrated.get('status')).toEqual({ type: 'leaf', value: FilterValue.value('PAID') });
        expect(hydrated.get('date-range')).toEqual(createDefaultFilterState(schema).get('date-range'));
    });
});

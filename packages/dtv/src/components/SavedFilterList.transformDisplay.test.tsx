/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import SavedFilterList from './SavedFilterList';
import { FilterGroups, TransformResult } from '../framework/filters';
import * as FilterValue from '../framework/filterValue';

describe('SavedFilterList', () => {
    it('displays transformed values when a leaf has transform.toQuery', () => {
        const filterGroups: FilterGroups = [
            {
                name: 'group',
                label: null,
                filters: [
                    {
                        id: 'amount-eq',
                        label: 'Amount',
                        aiGenerated: false,
                        expression: {
                            type: 'equals',
                            field: 'amount',
                            value: { type: 'number' },
                            transform: {
                                toQuery: (input: unknown) => {
                                    if (typeof input !== 'number') {
                                        return TransformResult.empty();
                                    }
                                    return TransformResult.value(input + 5);
                                }
                            }
                        }
                    }
                ]
            }
        ];

        const state = new Map([
            [
                'amount-eq',
                {
                    type: 'leaf' as const,
                    value: FilterValue.value(10)
                }
            ]
        ]);

        const html = renderToStaticMarkup(
            <SavedFilterList
                savedFilters={[
                    {
                        id: 'sf1',
                        name: 'My filter',
                        view: 'v1',
                        state,
                        createdAt: new Date('2026-01-01T00:00:00.000Z'),
                        formatRevision: '2025-09-19T00:00:00.000Z'
                    }
                ]}
                onFilterDelete={() => { }}
                onFilterLoad={() => { }}
                onFilterApply={() => { }}
                onFilterShare={() => { }}
                visible={true}
                filterGroups={filterGroups}
            />
        );

        expect(html).toContain('amount = 15');
        expect(html).not.toContain('amount = 10');
    });
});

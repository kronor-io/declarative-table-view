/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { GeminiApi, type RequestAiFilterFn } from './aiAssistant';
import type { FilterGroups } from '../framework/filters';
import * as FilterValue from '../framework/filterValue';

const filterGroups: FilterGroups = [{
    name: 'default',
    label: null,
    filters: [{
        id: 'customer-name',
        label: 'Customer name',
        expression: { type: 'equals', field: 'name', value: { type: 'text' } },
        aiGenerated: false
    }]
}];

describe('aiAssistant requestAiFilter', () => {
    beforeEach(() => {
        (globalThis as any).fetch = jest.fn(async () => {
            throw new Error('fetch should not be called when requestAiFilter is set');
        });
    });

    it('uses the custom request function instead of Gemini and applies its JSON text response', async () => {
        const requestAiFilter = jest.fn<RequestAiFilterFn>(async () =>
            'Here you go:\n{"customer-name": {"type": "leaf", "value": "Alice"}}'
        );
        const setFormState = jest.fn();

        await GeminiApi.sendPrompt(
            filterGroups,
            'Find orders from Alice',
            setFormState,
            { type: 'custom', requestAiFilter }
        );

        expect((globalThis as any).fetch).not.toHaveBeenCalled();
        expect(requestAiFilter).toHaveBeenCalledTimes(1);
        const args = requestAiFilter.mock.calls[0][0];
        expect(args.userPrompt).toBe('Find orders from Alice');
        expect(args.filterGroups).toBe(filterGroups);
        expect(args.prompt).toContain('User request: Find orders from Alice');
        expect(args.prompt).toContain('customer-name');

        expect(setFormState).toHaveBeenCalledTimes(1);
        const state = setFormState.mock.calls[0][0] as Map<string, any>;
        expect(state.get('customer-name')).toEqual({
            type: 'leaf',
            value: FilterValue.value('Alice')
        });
    });

    it('accepts an already-parsed object response', async () => {
        const requestAiFilter = jest.fn<RequestAiFilterFn>(async () => ({
            'customer-name': { type: 'leaf', value: 'Bob' }
        }));
        const setFormState = jest.fn();

        await GeminiApi.sendPrompt(
            filterGroups,
            'Find orders from Bob',
            setFormState,
            { type: 'custom', requestAiFilter }
        );

        expect(setFormState).toHaveBeenCalledTimes(1);
        const state = setFormState.mock.calls[0][0] as Map<string, any>;
        expect(state.get('customer-name').value).toEqual(FilterValue.value('Bob'));
    });

    it('applies modifyAiFilterPrompt before calling the custom request function', async () => {
        const requestAiFilter = jest.fn<RequestAiFilterFn>(async () => '{}');

        await GeminiApi.sendPrompt(
            filterGroups,
            'Find orders',
            jest.fn(),
            { type: 'custom', requestAiFilter },
            undefined,
            {
                modifyAiFilterPrompt: (template) => `${template}\n\n[EXTRA INSTRUCTION]`
            }
        );

        expect(requestAiFilter.mock.calls[0][0].prompt).toContain('[EXTRA INSTRUCTION]');
    });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';

import { GeminiApi } from './aiAssistant';

describe('aiAssistant modifyAiFilterPrompt', () => {
    it('modifies the built prompt template before sending to Gemini', async () => {
        const modifyAiFilterPrompt = (template: string) => `${template}\n\n[EXTRA INSTRUCTION]`;

        const fetchMock = jest.fn(async () => {
            return {
                ok: true,
                json: async () => ({
                    candidates: [{ content: { parts: [{ text: '{}' }] } }]
                })
            } as any;
        });
        (globalThis as any).fetch = fetchMock;

        const filterSchema = { groups: [{ name: 'default', label: null }], filters: [] };
        const setFormState = jest.fn();

        await GeminiApi.sendPrompt(
            filterSchema as any,
            'Find orders from yesterday',
            setFormState as any,
            'TEST_KEY',
            undefined,
            { modifyAiFilterPrompt }
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const call = fetchMock.mock.calls[0] as any[] | undefined;
        const fetchOptions = (call?.[1] ?? {}) as any;
        const body = JSON.parse(fetchOptions.body ?? '{}');
        const sentText = body.contents?.[0]?.parts?.[0]?.text;
        expect(typeof sentText).toBe('string');
        expect(sentText).toContain('User request: Find orders from yesterday');
        expect(sentText).toContain('[EXTRA INSTRUCTION]');

    });
});

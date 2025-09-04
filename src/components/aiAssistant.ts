// src/components/aiAssistant.ts
import { FilterExpr, FilterFieldSchema } from '../framework/filters';
import { FilterFormState, buildInitialFormState } from './FilterForm';
import { savedFilterManager, CURRENT_FORMAT_REVISION } from '../framework/saved-filters';

// --- Shared prompt and serialization helpers ---
export interface AIApi {
    sendPrompt(
        filterSchema: FilterFieldSchema,
        userPrompt: string,
        setFormState: (state: FilterFormState[]) => void,
        apiKey: string
    ): Promise<void>;
}

function sanitizeFilterExpr(expr: FilterExpr): object {
    if (expr.type === 'and' || expr.type === 'or') {
        return {
            type: expr.type,
            filters: expr.filters.map(sanitizeFilterExpr)
        };
    } else if (expr.type === 'not') {
        return {
            type: expr.type,
            child: sanitizeFilterExpr(expr.filter)
        };
    } else {
        // For dropdown and multiselect, include items
        if ((expr.value.type === 'dropdown' || expr.value.type === 'multiselect')) {
            return {
                type: expr.type,
                field: expr.field,
                items: expr.value.items
            };
        }
        return {
            type: expr.type,
            field: expr.field
        };
    }
}

function sanitizeFilterSchemaForAI(filterSchema: FilterFieldSchema): object[] {
    // Adapt to new schema shape
    return filterSchema.filters.map((field) => ({
        label: field.label,
        group: field.group,
        expression: sanitizeFilterExpr(field.expression),
        aiGenerated: field.aiGenerated ?? false
    }));
}

function buildAiPrompt(filterSchema: FilterFieldSchema, userPrompt: string): string {
    const filterFormStateType = `type FilterFormState =
  | { type: 'leaf'; field: string; value: any; }
  | { type: 'and' | 'or'; children: FilterFormState[]; }
  | { type: 'not'; child: FilterFormState; };`;
    const sanitizedSchema = sanitizeFilterSchemaForAI(filterSchema);
    const schemaStr = JSON.stringify(sanitizedSchema, null, 2);
    const currentDate = new Date().toString();
    return [
        `Given the following filter schema (in JSON):`,
        schemaStr,
        '',
        `And the following type definition for FilterFormState:`,
        filterFormStateType,
        '',
        `The current date is: ${currentDate}`,
        '',
        `Generate a valid array of FilterFormState (as JSON) that matches a user request. Follow the order of filters in the schema exactly.`,
        `User request: ${userPrompt}`,
        '',
        `For any filter in the schema that is not set based on the user request, include it in the output with an empty value (e.g., empty string, null, or empty array as appropriate). For date filters, always send the value as a plain string in standard date-time string format.`,
        `Output only the FilterFormState array, don't wrap it in an and expression.`
    ].join('\n');
}

// Helper to generate an empty FilterFormState array from schema
function emptyStateFromSchema(filterSchema: FilterFieldSchema): FilterFormState[] {
    return filterSchema.filters.map(field => buildInitialFormState(field.expression));
}

// Recursively copy only the value from aiState into emptyState, assuming same shape/order
function mergeStateByKey(emptyState: FilterFormState, aiState: any): FilterFormState {
    if (!aiState) return emptyState;
    if (emptyState.type === 'leaf' && aiState.type === 'leaf') {
        let value = aiState.value;

        // Patch customOperator values: if we get a plain string, wrap it into an object { value: s }
        if (emptyState.control?.type === 'customOperator' && typeof value === 'string') {
            const defaultOperator = emptyState.control.operators[0]?.value;
            value = { operator: defaultOperator, value: value };
        }

        return {
            ...emptyState,
            value: value
        };
    }
    if ((emptyState.type === 'and' || emptyState.type === 'or') && (aiState.type === 'and' || aiState.type === 'or')) {
        return {
            ...emptyState,
            children: mergeStateArrayByKey(emptyState.children, aiState.children)
        };
    }
    if (emptyState.type === 'not' && aiState.type === 'not') {
        return {
            ...emptyState,
            child: mergeStateByKey(emptyState.child, aiState.child)
        };
    }
    return emptyState;
}

function mergeStateArrayByKey(emptyArr: FilterFormState[], aiArr: unknown[]): FilterFormState[] {
    return emptyArr.map((emptyItem, i) => mergeStateByKey(emptyItem, aiArr?.[i]));
}

// --- Gemini Flash-Lite implementation ---
export const GeminiApi: AIApi = {
    async sendPrompt(filterSchema, userPrompt, setFormState, geminiApiKey) {
        const prompt = buildAiPrompt(filterSchema, userPrompt);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    })
                }
            );
            if (!response.ok) throw new Error('Gemini API error');
            const data = await response.json();
            const aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const match = aiContent.match(/\[.*\]/s);
            if (match) {
                const parsed = JSON.parse(match[0]);
                const emptyState = emptyStateFromSchema(filterSchema);
                const merged = mergeStateArrayByKey(emptyState, parsed);

                // Create a temporary saved filter to use the parsing logic
                const tempSavedFilter = {
                    id: 'temp',
                    name: 'temp',
                    view: 'temp',
                    state: merged,
                    createdAt: new Date(),
                    formatRevision: CURRENT_FORMAT_REVISION
                };

                setFormState(savedFilterManager.parseFilterState(tempSavedFilter, filterSchema));
            } else {
                alert('Could not parse FilterFormState from Gemini response. Check the console.');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to get response from Gemini API.');
        }
    }
};

export function generateFilterWithAI(
    filterSchema: FilterFieldSchema,
    userPrompt: string,
    setFormState: (state: FilterFormState[]) => void,
    apiImpl: AIApi,
    geminiApiKey: string
): Promise<void> {
    return apiImpl.sendPrompt(filterSchema, userPrompt, setFormState, geminiApiKey);
}

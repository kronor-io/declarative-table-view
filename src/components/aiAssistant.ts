// src/components/aiAssistant.ts
import { FilterExpr, FilterSchemasAndGroups, FilterExprFieldNode } from '../framework/filters';
import { FilterFormState } from '../framework/filter-form-state';
import { buildInitialFormState, createDefaultFilterState, FormStateInitMode } from '../framework/state';
import { RefObject } from 'react';
import { Toast } from 'primereact/toast';
import { FilterState } from '../framework/state';

// --- Shared prompt and serialization helpers ---
export interface AIApi {
    sendPrompt(
        filterSchema: FilterSchemasAndGroups,
        userPrompt: string,
        setFormState: (state: FilterState) => void,
        apiKey: string,
        toast?: RefObject<Toast | null>
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

function sanitizeFilterSchemaForAI(filterSchema: FilterSchemasAndGroups): object[] {
    // Adapt to new schema shape
    return filterSchema.filters.map((field) => ({
        id: field.id,
        expression: sanitizeFilterExpr(field.expression),
    }));
}

function buildAiPrompt(filterSchema: FilterSchemasAndGroups, userPrompt: string): string {
    const filterFormStateType = `type FilterFormState =
  | { type: 'leaf'; value: any; }
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
        `Generate a valid JSON object with filter IDs as keys and values containing filter state according to the filter expression in the schema, that matches a user request.`,
        `For filter trees, preserve the structure of and/or/not according to the schema and the FilterFormState type.`,
        `User request: ${userPrompt}`,
        '',
        `For date filters, always send the value as a plain string in standard date-time string format. Skip filters that are not relevant to the user request.`,
        `Output only the object mapping filter IDs to FilterFormState, like: {"filter-id": {...filterFormState...}}`
    ].join('\n');
}

// Helper to merge AI-generated filter object with current state
function mergeAiStateWithCurrent(currentState: FilterState, aiStateObject: Record<string, any>, filterSchema: FilterSchemasAndGroups): FilterState {
    const newState = new Map(currentState);

    // For each filter in the AI response, merge it with the corresponding current state
    Object.entries(aiStateObject).forEach(([filterId, aiFilterState]) => {
        const filterDef = filterSchema.filters.find(f => f.id === filterId);
        if (filterDef) {
            const currentFilterState = currentState.get(filterId) || buildInitialFormState(filterDef.expression);
            const mergedFilterState = mergeFilterFormState(filterDef.expression, currentFilterState, aiFilterState);
            newState.set(filterId, mergedFilterState);
        }
    });

    return newState;
}

// Recursively merge AI state into existing FilterFormState using schema-guided traversal
export function mergeFilterFormState(schema: FilterExpr, currentState: FilterFormState, aiState: any): FilterFormState {
    if (!aiState) return currentState;

    // Patch: If schema expects an 'in' or 'notIn' array but AI produced an OR list of single values, collapse to array
    // Example AI output (FilterFormState shape): { type: 'or', children: [ { type: 'leaf', value: 'a' }, { type: 'leaf', value: 'b' } ] }
    // We convert it to a single leaf with value ['a','b'] so downstream logic treats it as an IN list.
    if ((schema.type === 'in' || schema.type === 'notIn') && aiState.type === 'or' && Array.isArray(aiState.children)) {
        const collectValues = (node: any, acc: any[]) => {
            if (!node) return acc;
            if (node.type === 'leaf') {
                if (node.value !== undefined && node.value !== '') {
                    acc.push(node.value);
                }
            } else if (node.type === 'or' && Array.isArray(node.children)) {
                node.children.forEach((c: any) => collectValues(c, acc));
            }
            return acc;
        };
        const values = Array.from(new Set(collectValues(aiState, [])));
        return {
            ...currentState,
            type: 'leaf',
            value: values
        };
    }

    // Special case: AI returns NOT wrapped around a leaf for a customOperator field - convert to not-equals
    if (currentState.type === 'leaf' && aiState.type === 'not' && aiState.child?.type === 'leaf') {
        const schemaField = schema as FilterExprFieldNode;
        const control = schemaField.value;

        if (control.type === 'customOperator') {
            const childValue = aiState.child.value;
            const notEqualsOperator = control.operators?.find((op: any) =>
                op.value.includes('neq') || op.value.includes('not_equals') || op.label.toLowerCase().includes('not equals')
            );

            if (notEqualsOperator) {
                const value = typeof childValue === 'string' ?
                    { operator: notEqualsOperator.value, value: childValue } :
                    childValue;

                return {
                    ...currentState,
                    value: value
                };
            }
        }
    }

    if (currentState.type === 'leaf' && aiState.type === 'leaf') {
        let value = aiState.value;

        // Use control info from schema for customOperator
        const schemaField = schema as FilterExprFieldNode;
        const control = schemaField.value;

        // Patch for 'in' and 'notIn' to ensure value is an array
        if (schemaField.type === 'in' || schemaField.type === 'notIn') {
            if (!Array.isArray(value)) {
                value = [value];
            }
        }

        // Patch customOperator if AI returned a plain string
        if (control.type === 'customOperator' && typeof value === 'string') {
            const defaultOperator = control.operators?.[0]?.value;
            value = { operator: defaultOperator, value: value };
        }

        // Create Date objects from ISO strings for date fields
        if (control.type === 'date' && typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                value = date;
            } else {
                console.warn(`Failed to parse date for field ${schemaField.field}:`, value);
            }
        }

        return {
            ...currentState,
            value: value
        };
    }

    if (currentState.type === 'and' && schema.type === 'and' &&
        aiState.type === 'and' && Array.isArray(aiState.children)) {
        return {
            ...currentState,
            children: currentState.children.map((child, i) => {
                const childSchema = schema.filters[i];
                const childAiState = aiState.children[i];
                return childSchema ?
                    mergeFilterFormState(childSchema, child, childAiState) :
                    child;
            })
        };
    }

    if (currentState.type === 'or' && schema.type === 'or' &&
        aiState.type === 'or' && Array.isArray(aiState.children)) {
        return {
            ...currentState,
            children: currentState.children.map((child, i) => {
                const childSchema = schema.filters[i];
                const childAiState = aiState.children[i];
                return childSchema ?
                    mergeFilterFormState(childSchema, child, childAiState) :
                    child;
            })
        };
    }

    if (currentState.type === 'not' && schema.type === 'not' && aiState.type === 'not') {
        return {
            ...currentState,
            child: mergeFilterFormState(schema.filter, currentState.child, aiState.child)
        };
    }

    return currentState;
}

// --- Gemini Flash-Lite implementation ---
export const GeminiApi: AIApi = {
    async sendPrompt(filterSchema, userPrompt, setFormState, geminiApiKey, toast) {
        const prompt = buildAiPrompt(filterSchema, userPrompt);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
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
            // Use [\s\S] instead of dot-all flag for compatibility
            const match = aiContent.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);

                // Make an empty state and merge with AI response
                const currentState = createDefaultFilterState(filterSchema, FormStateInitMode.Empty);
                const mergedState = mergeAiStateWithCurrent(currentState, parsed, filterSchema);

                setFormState(mergedState);
            } else {
                const errorMessage = 'Could not parse FilterFormState from Gemini response. Check the console.';
                if (toast?.current) {
                    toast.current.show({
                        severity: 'warn',
                        summary: 'Parse Error',
                        detail: errorMessage,
                        life: 3000
                    });
                } else {
                    alert(errorMessage);
                }
            }
        } catch (err) {
            console.error(err);
            const errorMessage = 'Failed to get response from Gemini API.';
            if (toast?.current) {
                toast.current.show({
                    severity: 'error',
                    summary: 'API Error',
                    detail: errorMessage,
                    life: 3000
                });
            } else {
                alert(errorMessage);
            }
        }
    }
};

export function generateFilterWithAI(
    filterSchema: FilterSchemasAndGroups,
    userPrompt: string,
    setFormState: (state: FilterState) => void,
    apiImpl: AIApi,
    geminiApiKey: string,
    toast?: RefObject<Toast | null>
): Promise<void> {
    return apiImpl.sendPrompt(filterSchema, userPrompt, setFormState, geminiApiKey, toast);
}

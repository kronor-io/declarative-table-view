// src/components/aiAssistant.ts
import type { CustomOperatorOption, FilterControl, FilterExpr, FilterExprFieldNode, FilterGroups } from '../framework/filters';
import { customOperatorTakesValue, defaultCustomOperator, isLeaf } from '../framework/filters';
import type { FilterFormState } from '../framework/filter-form-state';
import { buildInitialFormState, createDefaultFilterState, FormStateInitMode, FilterState } from '../framework/state';
import * as FilterValue from '../framework/filterValue';
import type { RefObject } from 'react';
import type { Toast } from 'primereact/toast';
import { getAllFilters } from '../framework/view';

// --- Shared prompt and serialization helpers ---
/** Whether the AI filled the filters; it tells the user itself when not. */
export type AIFilterResult = { readonly filled: true } | { readonly filled: false; readonly error: unknown };

export interface AIApi {
    sendPrompt(
        filterGroups: FilterGroups,
        userPrompt: string,
        setFormState: (state: FilterState) => void,
        aiIntegration: AIIntegration,
        toast?: RefObject<Toast | null>,
        options?: {
            modifyAiFilterPrompt?: ModifyAiFilterPromptFn
        }
    ): Promise<AIFilterResult>;
}

export type ModifyAiFilterPromptFn = (
    promptTemplate: string,
    args: { filterGroups: FilterGroups; userPrompt: string }
) => string;

/**
 * Custom AI provider request function. Receives the fully-built prompt (after
 * `modifyAiFilterPrompt`, if any) and must return either the raw model text
 * containing a JSON object mapping filter IDs to FilterFormState, or that
 * object already parsed.
 */
export type RequestAiFilterFn = (args: {
    prompt: string;
    filterGroups: FilterGroups;
    userPrompt: string;
}) => Promise<string | Record<string, unknown>>;

/** AI provider used by the AI Filter Assistant. */
export type AIIntegration =
    | { type: 'builtInGemini'; geminiApiKey: string }
    | { type: 'custom'; requestAiFilter: RequestAiFilterFn };

// export const DEFAULT_GEMINI_MODEL_ID = 'gemini-2.5-flash-lite';
export const DEFAULT_GEMINI_MODEL_ID = 'gemini-2.5-flash-lite-preview-09-2025';

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

function sanitizeFilterSchemaForAI(filterGroups: FilterGroups): object[] {
    return getAllFilters(filterGroups).map((field) => ({
        id: field.id,
        expression: sanitizeFilterExpr(field.expression),
    }));
}

function buildAiPrompt(
    filterGroups: FilterGroups,
    userPrompt: string,
    modifyAiFilterPrompt?: ModifyAiFilterPromptFn
): string {
    const filterFormStateType = `type FilterFormState =
  | { type: 'leaf'; value: any; }
  | { type: 'and' | 'or'; children: FilterFormState[]; }
  | { type: 'not'; child: FilterFormState; };`;
    const sanitizedSchema = sanitizeFilterSchemaForAI(filterGroups);
    const schemaStr = JSON.stringify(sanitizedSchema, null, 2);
    const currentDate = new Date().toString();
    const promptTemplate = [
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
        `For dropdown and multiselect filters, the leaf value is an item's \`value\` (a list of them for a multiselect), never the item object.`,
        `Output only the object mapping filter IDs to FilterFormState, like: {"filter-id": {...filterFormState...}}`
    ].join('\n');

    return modifyAiFilterPrompt
        ? modifyAiFilterPrompt(promptTemplate, { filterGroups, userPrompt })
        : promptTemplate;
}

export async function requestGeminiGenerateContent(args: {
    filterGroups: FilterGroups;
    userPrompt: string;
    geminiApiKey: string;
    modelId?: string;
    modifyAiFilterPrompt?: ModifyAiFilterPromptFn;
    httpReferer?: string;
    origin?: string;
}): Promise<{
    modelId: string;
    prompt: string;
    responseJson: unknown;
    aiText: string;
}> {
    const modelId = args.modelId ?? DEFAULT_GEMINI_MODEL_ID;
    const prompt = buildAiPrompt(args.filterGroups, args.userPrompt, args.modifyAiFilterPrompt);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (args.httpReferer) {
        headers['Referer'] = args.httpReferer;
    }
    if (args.origin) {
        headers['Origin'] = args.origin;
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${args.geminiApiKey}`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            })
        }
    );
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Gemini API error (${response.status}): ${text}`);
    }

    const responseJson: any = await response.json();
    const aiText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
        modelId,
        prompt,
        responseJson,
        aiText,
    };
}

// Helper to merge AI-generated filter object with current state
function mergeAiStateWithCurrent(currentState: FilterState, aiStateObject: Record<string, any>, filterGroups: FilterGroups): FilterState {
    const newState = new Map(currentState);
    const filterById = new Map(getAllFilters(filterGroups).map((filter) => [filter.id, filter] as const));

    // For each filter in the AI response, merge it with the corresponding current state
    Object.entries(aiStateObject).forEach(([filterId, aiFilterState]) => {
        const filterDef = filterById.get(filterId);
        if (filterDef) {
            const currentFilterState = currentState.get(filterId) || buildInitialFormState(filterDef.expression);
            const mergedFilterState = mergeFilterFormState(filterDef.expression, currentFilterState, aiFilterState);
            newState.set(filterId, mergedFilterState);
        }
    });

    return newState;
}

function normalizeCustomOperatorValue(
    operators: readonly CustomOperatorOption[],
    operator: string | undefined,
    rawValue: unknown
): FilterValue.FilterValue {
    if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
        const record = rawValue as { operator?: unknown; value?: unknown };
        if (typeof record.operator === 'string' && 'value' in record) {
            return normalizeCustomOperatorValue(operators, record.operator, record.value);
        }
    }

    if (!operator) {
        return FilterValue.empty;
    }

    if (!customOperatorTakesValue(operators, operator)) {
        return FilterValue.value({ operator, value: FilterValue.empty });
    }

    if (rawValue === undefined || rawValue === '' || rawValue === null || (Array.isArray(rawValue) && rawValue.length === 0)) {
        return FilterValue.empty;
    }

    const innerValue = FilterValue.fromObject(rawValue) ?? FilterValue.value(rawValue);
    if (FilterValue.isEmpty(innerValue)) {
        return FilterValue.empty;
    }

    return FilterValue.value({ operator, value: innerValue });
}

type SelectControl = Extract<FilterControl, { type: 'dropdown' | 'multiselect' }>;
type SelectItem = SelectControl['items'][number];

function selectControlOf(schema: FilterExpr): SelectControl | undefined {
    if (!isLeaf(schema)) return undefined;
    const control = schema.value;
    return control.type === 'dropdown' || control.type === 'multiselect' ? control : undefined;
}

// Sort object keys so {b: 2, a: 1} and {a: 1, b: 2} compare equal.
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
    }
    return value;
}

function sameItemValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    try {
        return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    } catch {
        return false;
    }
}

// 'card' for 'CARD', '5' for 5, 'false' for false.
function looseKey(value: unknown): string | undefined {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value).trim().toLowerCase()
        : undefined;
}

function findSelectItem(items: readonly SelectItem[], raw: unknown): SelectItem | undefined {
    // The prompt shows the model each item as {label, value}, and it sometimes
    // hands the whole item back instead of its value.
    const candidates = [raw];
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'value' in raw) {
        candidates.push((raw as { value: unknown }).value);
    }

    for (const candidate of candidates) {
        const byValue = items.find((item) => sameItemValue(item.value, candidate));
        if (byValue) return byValue;
    }

    if (typeof raw === 'string') {
        const wanted = raw.trim().toLowerCase();
        const byLabel = items.find((item) => typeof item.label === 'string' && item.label.trim().toLowerCase() === wanted);
        if (byLabel) return byLabel;
    }

    for (const candidate of candidates) {
        const wanted = looseKey(candidate);
        if (wanted === undefined) continue;
        const byLooseValue = items.find((item) => looseKey(item.value) === wanted);
        if (byLooseValue) return byLooseValue;
    }

    return undefined;
}

/**
 * Map whatever the model returned for a dropdown/multiselect to the values of
 * the control's items, dropping anything that matches no item. Without this an
 * item object like {label: 'DKK', value: 'DKK'} reached the GraphQL query and
 * the server rejected it.
 *
 * A list is first tried as one item value, since item values can be lists, and
 * only then split; one level of nested lists is flattened.
 */
function toSelectItemValues(items: readonly SelectItem[], raw: unknown, field: unknown): any[] {
    const matched: SelectItem[] = [];
    const dropped: unknown[] = [];

    const add = (value: unknown, depth: number) => {
        if (value === undefined || value === null || value === '') return;
        const item = findSelectItem(items, value);
        if (item) {
            if (!matched.includes(item)) matched.push(item);
        } else if (Array.isArray(value) && depth < 2) {
            value.forEach((element) => add(element, depth + 1));
        } else {
            dropped.push(value);
        }
    };
    add(raw, 0);

    if (dropped.length > 0) {
        console.warn('AI filter: dropped values that match no item of the control for field', field, dropped);
    }
    return matched.map((item) => item.value);
}

// A dropdown holds one item value, whatever the comparison; a multiselect a list.
function selectFilterValue(control: SelectControl, raw: unknown, field: unknown): FilterValue.FilterValue {
    const values = toSelectItemValues(control.items ?? [], raw, field);
    if (values.length === 0) return FilterValue.empty;
    return FilterValue.value(control.type === 'multiselect' ? values : values[0]);
}

// Recursively merge AI state into existing FilterFormState using schema-guided traversal
export function mergeFilterFormState(schema: FilterExpr, currentState: FilterFormState, aiState: any): FilterFormState {
    if (!aiState) return currentState;

    // Patch: If schema expects an 'in' or 'notIn' array but AI produced a
    // boolean tree of single values, collapse to array.
    // Example AI output (FilterFormState shape): { type: 'or', children: [ { type: 'leaf', value: 'a' }, { type: 'leaf', value: 'b' } ] }
    // We convert it to a single leaf with value ['a','b'] so downstream logic treats it as an IN list.
    //
    // 'and' is accepted alongside 'or' because models emit it for the same
    // request from one run to the next — "payments in euro or Danish krona"
    // came back as an 'or' tree once and an 'and' tree the next time. An IN
    // list is the only thing the control can express either way, and the
    // alternative is what used to happen: no branch matched, the filter was
    // silently dropped, and the user got an unfiltered column with no error.
    const isValueTree = aiState.type === 'or' || aiState.type === 'and';
    if ((schema.type === 'in' || schema.type === 'notIn') && isValueTree && Array.isArray(aiState.children)) {
        const collectValues = (node: any, acc: any[]) => {
            if (!node) return acc;
            if (node.type === 'leaf') {
                const v = node.value;
                if (v !== undefined && v !== '' && v !== null) {
                    acc.push(v);
                }
            } else if ((node.type === 'or' || node.type === 'and') && Array.isArray(node.children)) {
                node.children.forEach((c: any) => collectValues(c, acc));
            }
            return acc;
        };
        const collected = collectValues(aiState, []);
        const selectControl = selectControlOf(schema);
        if (selectControl) {
            return {
                ...currentState,
                type: 'leaf',
                value: selectFilterValue(selectControl, collected, schema.field)
            };
        }
        const values = Array.from(new Set(collected));
        return {
            ...currentState,
            type: 'leaf',
            value: values.length === 0 ? FilterValue.empty : FilterValue.value(values)
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
                const value = normalizeCustomOperatorValue(control.operators, notEqualsOperator.value, childValue);

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
        if (control.type === 'customOperator') {
            const defaultOperator = defaultCustomOperator(control.operators ?? []);
            return {
                ...currentState,
                value: normalizeCustomOperatorValue(control.operators ?? [], defaultOperator, value)
            };
        }

        // Keep only values that are items of the control, as the control itself would
        const selectControl = selectControlOf(schemaField);
        if (selectControl) {
            return { ...currentState, value: selectFilterValue(selectControl, aiState.value, schemaField.field) };
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

        // Patch autocomplete values to empty strings to prevent breaking the control
        if (control.type === 'autocomplete') {
            value = '';
        }

        return {
            ...currentState,
            value: (value === undefined || value === '' || value === null || (Array.isArray(value) && value.length === 0))
                ? FilterValue.empty
                : FilterValue.value(value)
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

// --- Built-in Gemini implementation, with custom-provider support ---
export const GeminiApi: AIApi = {
    async sendPrompt(filterGroups, userPrompt, setFormState, aiIntegration, toast, options) {
        try {
            let aiResult: string | Record<string, unknown>;
            if (aiIntegration.type === 'custom') {
                const prompt = buildAiPrompt(filterGroups, userPrompt, options?.modifyAiFilterPrompt);
                aiResult = await aiIntegration.requestAiFilter({ prompt, filterGroups, userPrompt });
            } else {
                const { aiText } = await requestGeminiGenerateContent({
                    filterGroups,
                    userPrompt,
                    geminiApiKey: aiIntegration.geminiApiKey,
                    modifyAiFilterPrompt: options?.modifyAiFilterPrompt,
                });
                aiResult = aiText;
            }

            let parsed: Record<string, unknown> | null = null;
            if (typeof aiResult === 'string') {
                // Use [\s\S] instead of dot-all flag for compatibility
                const match = aiResult.match(/\{[\s\S]*\}/);
                if (match) {
                    parsed = JSON.parse(match[0]);
                }
            } else {
                parsed = aiResult;
            }

            if (parsed) {
                // Make an empty state and merge with AI response
                const currentState = createDefaultFilterState(filterGroups, FormStateInitMode.Empty);
                const mergedState = mergeAiStateWithCurrent(currentState, parsed, filterGroups);

                setFormState(mergedState);
                return { filled: true };
            } else {
                const errorMessage = 'Could not parse FilterFormState from AI response. Check the console.';
                if (toast?.current) {
                    toast.current.show({
                        severity: 'warn',
                        summary: 'Parse Error',
                        detail: errorMessage,
                        life: 3000
                    });
                } else {
                    console.warn(errorMessage);
                }
                return { filled: false, error: new Error(errorMessage) };
            }
        } catch (err) {
            console.error(err);
            const errorMessage = 'Failed to get response from the AI provider.';
            if (toast?.current) {
                toast.current.show({
                    severity: 'error',
                    summary: 'API Error',
                    detail: errorMessage,
                    life: 3000
                });
            } else {
                console.warn(errorMessage);
            }
            return { filled: false, error: err };
        }
    }
};

export function generateFilterWithAI(
    filterGroups: FilterGroups,
    userPrompt: string,
    setFormState: (state: FilterState) => void,
    apiImpl: AIApi,
    aiIntegration: AIIntegration,
    toast?: RefObject<Toast | null>,
    options?: {
        modifyAiFilterPrompt?: ModifyAiFilterPromptFn
    }
): Promise<AIFilterResult> {
    return apiImpl.sendPrompt(filterGroups, userPrompt, setFormState, aiIntegration, toast, options);
}

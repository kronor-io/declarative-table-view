import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import SpeechInput from './SpeechInput';
import { buildInitialFormState } from '../framework/state';
import { useState, RefObject } from 'react';
import { filterExprFromJSON, FilterFieldSchema, getFieldNodes } from '../framework/filters';
import { View } from '../framework/view';
import { generateFilterWithAI, GeminiApi } from './aiAssistant';
import { FilterState } from '../framework/state';

interface AIAssistantFormProps {
    filterSchema: FilterFieldSchema;
    filterState: FilterState;
    setFilterSchema: (schema: FilterFieldSchema) => void;
    setFilterState: (state: FilterState) => void;
    selectedView: View;
    geminiApiKey: string;
    toast: RefObject<Toast | null>;
}

export default function AIAssistantForm({
    filterSchema,
    filterState,
    setFilterSchema,
    setFilterState,
    selectedView,
    geminiApiKey,
    toast
}: AIAssistantFormProps) {
    const [aiPrompt, setAiPrompt] = useState('authorized payments in euro or danish krona in the first week of april 2025');
    const [aiFilterExprInput, setAiFilterExprInput] = useState('(payment method or currency) and a filter to exclude payment status');
    const [aiLoading, setAiLoading] = useState(false);
    return (
        <div className="flex flex-col gap-2 mb-3">
            <label className="text-sm font-semibold mb-1" htmlFor="ai-prompt">AI Prompt</label>
            <div className="flex gap-2">
                <SpeechInput value={aiPrompt} onChange={setAiPrompt} />
                <Button
                    type="button"
                    outlined
                    label="Update filters"
                    icon='pi pi-sparkles'
                    loading={aiLoading}
                    onClick={async () => {
                        setAiLoading(true);
                        try {
                            await generateFilterWithAI(selectedView.filterSchema, aiPrompt, setFilterState, GeminiApi, geminiApiKey, toast);

                            toast.current?.show({
                                severity: 'success',
                                summary: 'AI Filter Generated',
                                detail: 'Filter values have been populated based on your prompt',
                                life: 3000
                            });
                        } catch (error) {
                            console.error('AI filter generation failed:', error);
                            toast.current?.show({
                                severity: 'error',
                                summary: 'AI Generation Failed',
                                detail: 'Failed to generate filter from AI. Please try again.',
                                life: 3000
                            });
                        } finally {
                            setAiLoading(false);
                        }
                    }}
                    className='p-button-secondary'
                />
            </div>
            <label className="text-sm font-semibold mt-4" htmlFor="ai-filterexpr-input">Add a custom filter with AI</label>
            <div className="flex items-center gap-2">
                <InputText
                    id="ai-filterexpr-input"
                    value={aiFilterExprInput}
                    onChange={e => setAiFilterExprInput(e.target.value)}
                    placeholder="Describe filter in natural language..."
                    className="flex-1"
                />
                <Button
                    type="button"
                    outlined
                    label="Generate filter"
                    icon='pi pi-sparkles'
                    loading={aiLoading}
                    onClick={async () => {
                        setAiLoading(true);
                        try {
                            const filterSchemaJson = JSON.stringify(filterSchema, null, 2);
                            const allKeys = Array.from(
                                new Set(
                                    selectedView.filterSchema.filters
                                        .flatMap(filter => getFieldNodes(filter.expression)
                                            .map(node => node.field)
                                        )
                                )
                            );
                            const filterControlType = [
                                'type FilterControl =',
                                '  | { type: "text"; label?: string; placeholder?: string }',
                                '  | { type: "number"; label?: string; placeholder?: string }',
                                '  | { type: "date"; label?: string; placeholder?: string }',
                                '  | { type: "dropdown"; label?: string; items: { label: string; value: any }[] }',
                                '  | { type: "multiselect"; label?: string; items: { label: string; value: any }[], filterable?: boolean }',
                                '  | { type: "customOperator"; label?: string; operators: { label: string; value: string }[]; valueControl: FilterControl }',
                                '  | { type: "custom"; component: React.ComponentType<any>; props?: Record<string, any>; label?: string };'
                            ].join('\n');
                            const filterExprType = [
                                'type FilterExpr =',
                                '  | { type: "equals"; field: string; value: FilterControl }',
                                '  | { type: "notEquals"; field: string; value: FilterControl }',
                                '  | { type: "greaterThan"; field: string; value: FilterControl }',
                                '  | { type: "lessThan"; field: string; value: FilterControl }',
                                '  | { type: "greaterThanOrEqual"; field: string; value: FilterControl }',
                                '  | { type: "lessThanOrEqual"; field: string; value: FilterControl }',
                                '  | { type: "in"; field: string; value: FilterControl }',
                                '  | { type: "notIn"; field: string; value: FilterControl }',
                                '  | { type: "like"; field: string; value: FilterControl }',
                                '  | { type: "iLike"; field: string; value: FilterControl }',
                                '  | { type: "isNull"; field: string; value: FilterControl }',
                                '  | { type: "and"; filters: FilterExpr[] }',
                                '  | { type: "or"; filters: FilterExpr[] }',
                                '  | { type: "not"; filter: FilterExpr };'
                            ].join('\n');
                            const template = [
                                'You are an expert TypeScript assistant.',
                                '',
                                'Here are the type definitions for FilterControl and FilterExpr:',
                                '',
                                filterControlType,
                                '',
                                filterExprType,
                                '',
                                'Available data keys:',
                                JSON.stringify(allKeys, null, 2),
                                '',
                                'Current filter schema (including control configuration, dropdown/multiselect values, etc.):',
                                filterSchemaJson,
                                '',
                                'User prompt:',
                                aiFilterExprInput,
                                '',
                                'Instructions:',
                                '- Generate a valid FilterExpr as JSON, using only the available data keys.',
                                '- When generating a filter for a field, use the control configuration from the filter schema (e.g. use the same dropdown/multiselect values for matching data keys).',
                                '- Only use supported FilterControl types (text, number, date, dropdown, multiselect) with labels',
                                '- Do not use custom or transformation functions.',
                                '- Output only the JSON for the FilterExpr, nothing else.',
                                '- The JSON must be valid and parseable.',
                            ].join('\n');
                            let aiContent = '';
                            try {
                                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [{ role: 'user', parts: [{ text: template }] }]
                                    })
                                });
                                if (!response.ok) throw new Error('Gemini API error');
                                const data = await response.json();
                                aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            } catch (error) {
                                console.error('Gemini API error:', error);
                                toast.current?.show({
                                    severity: 'error',
                                    summary: 'API Error',
                                    detail: 'Failed to get response from Gemini API.',
                                    life: 3000
                                });
                                setAiLoading(false);
                                return;
                            }
                            let exprJson: any = null;
                            const match = aiContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                            if (match) {
                                try {
                                    exprJson = JSON.parse(match[0]);
                                } catch (error) {
                                    console.error('Invalid JSON from AI:', error);
                                    toast.current?.show({
                                        severity: 'warn',
                                        summary: 'Invalid Response',
                                        detail: 'AI response is not valid JSON',
                                        life: 3000
                                    });
                                    setAiLoading(false);
                                    return;
                                }
                            } else {
                                toast.current?.show({
                                    severity: 'warn',
                                    summary: 'No Filter Found',
                                    detail: 'Could not find JSON in AI response',
                                    life: 3000
                                });
                                setAiLoading(false);
                                return;
                            }
                            const filterExpr = filterExprFromJSON(exprJson);
                            if (!filterExpr) {
                                toast.current?.show({
                                    severity: 'warn',
                                    summary: 'Parse Error',
                                    detail: 'Could not parse AI response as FilterExpr',
                                    life: 3000
                                });
                                setAiLoading(false);
                                return;
                            }
                            // Generate a unique ID for the AI filter
                            const aiFilterId = `ai-filter-${Date.now()}`;
                            const newSchema = {
                                ...filterSchema,
                                filters: [
                                    ...filterSchema.filters,
                                    { id: aiFilterId, label: 'AI Filter', expression: filterExpr, group: 'default', aiGenerated: true }
                                ]
                            };
                            setFilterSchema(newSchema);

                            // Add the AI-generated filter to the existing FilterState Map
                            filterState.set(aiFilterId, buildInitialFormState(filterExpr));
                            setFilterState(new Map(filterState)); // Trigger React re-render

                            toast.current?.show({
                                severity: 'success',
                                summary: 'AI Filter Added',
                                detail: 'New filter has been created and added to the form',
                                life: 3000
                            });
                        } finally {
                            setAiLoading(false);
                        }
                    }}
                    className='p-button-secondary'
                />
            </div>
        </div>
    );
}

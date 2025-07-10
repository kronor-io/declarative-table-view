import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import SpeechInput from './SpeechInput';
import { FilterFormState, buildInitialFormState } from './FilterForm';
import { useState } from 'react';
import { FilterFieldSchema } from '../framework/filters';
import { View } from '../framework/view';

interface AIAssistantFormProps {
    filterSchema: FilterFieldSchema;
    filterState: FilterFormState[];
    setFilterSchema: (schema: FilterFieldSchema) => void;
    setFilterState: (state: FilterFormState[]) => void;
    selectedView: View<any, any>;
    geminiApiKey: string
}

export default function AIAssistantForm({
    filterSchema,
    filterState,
    setFilterSchema,
    setFilterState,
    selectedView,
    geminiApiKey
}: AIAssistantFormProps) {
    const [aiPrompt, setAiPrompt] = useState('authorized payments in euro or danish krona in the first week of april 2025');
    const [aiFilterExprInput, setAiFilterExprInput] = useState('(payment method or currency) and a filter to exclude payment status');
    const [aiLoading, setAiLoading] = useState(false);
    return (
        <div className="flex flex-col gap-2 mb-3">
            <label className="text-sm font-semibold mb-1" htmlFor="ai-prompt">AI Prompt</label>
            <div className="flex items-center justify-center gap-2">
                <SpeechInput value={aiPrompt} onChange={setAiPrompt} />
                <Button
                    type="button"
                    outlined
                    label="Generate Filter"
                    icon='pi pi-sparkles'
                    loading={aiLoading}
                    onClick={async () => {
                        setAiLoading(true);
                        try {
                            const { generateFilterWithAI, GeminiApi } = await import('./aiAssistant');
                            await generateFilterWithAI(selectedView.filterSchema, aiPrompt, setFilterState, GeminiApi, geminiApiKey);
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
                    className="flex-1 min-w-6xl"
                />
                <Button
                    type="button"
                    outlined
                    label="Add filter"
                    icon='pi pi-sparkles'
                    loading={aiLoading}
                    onClick={async () => {
                        setAiLoading(true);
                        try {
                            const filterSchemaJson = JSON.stringify(filterSchema, null, 2);
                            function collectKeys(expr: any): string[] {
                                if (!expr) return [];
                                if ('key' in expr && typeof expr.key === 'string') return [expr.key];
                                if (expr.filters && Array.isArray(expr.filters)) return expr.filters.flatMap(collectKeys);
                                if (expr.filter) return collectKeys(expr.filter);
                                return [];
                            }
                            const allKeys = Array.from(new Set(selectedView.filterSchema.filters.flatMap((f: any) => collectKeys(f.expression))));
                            const filterControlType = `type FilterControl =\n  | { type: 'text'; label?: string; placeholder?: string }\n  | { type: 'number'; label?: string; placeholder?: string }\n  | { type: 'date'; label?: string; placeholder?: string }\n  | { type: 'dropdown'; label?: string; items: { label: string; value: any }[] }\n  | { type: 'multiselect'; label?: string; items: { label: string; value: any }[], filterable?: boolean }\n  | { type: 'customOperator'; label?: string; operators: { label: string; value: string }[]; valueControl: FilterControl }\n  | { type: 'custom'; component: React.ComponentType<any>; props?: Record<string, any>; label?: string };`;
                            const filterExprType = `type FilterExpr =\n  | { type: 'equals'; key: string; value: FilterControl }\n  | { type: 'notEquals'; key: string; value: FilterControl }\n  | { type: 'greaterThan'; key: string; value: FilterControl }\n  | { type: 'lessThan'; key: string; value: FilterControl }\n  | { type: 'greaterThanOrEqual'; key: string; value: FilterControl }\n  | { type: 'lessThanOrEqual'; key: string; value: FilterControl }\n  | { type: 'in'; key: string; value: FilterControl }\n  | { type: 'notIn'; key: string; value: FilterControl }\n  | { type: 'like'; key: string; value: FilterControl }\n  | { type: 'iLike'; key: string; value: FilterControl }\n  | { type: 'isNull'; key: string; value: FilterControl }\n  | { type: 'and'; filters: FilterExpr[] }\n  | { type: 'or'; filters: FilterExpr[] }\n  | { type: 'not'; filter: FilterExpr };`;
                            const template = `You are an expert TypeScript assistant.\n\nHere are the type definitions for FilterControl and FilterExpr:\n\n${filterControlType}\n\n${filterExprType}\n\nAvailable data keys:\n${JSON.stringify(allKeys, null, 2)}\n\nCurrent filter schema (including control configuration, dropdown/multiselect values, etc.):\n${filterSchemaJson}\n\nUser prompt:\n${aiFilterExprInput}\n\nInstructions:\n- Generate a valid FilterExpr as JSON, using only the available data keys.\n- When generating a filter for a field, use the control configuration from the filter schema (e.g. use the same dropdown/multiselect values for matching data keys).\n- Only use supported FilterControl types (text, number, date, dropdown, multiselect).\n- Do not use custom or transformation functions.\n- Output only the JSON for the FilterExpr, nothing else.\n- The JSON must be valid and parseable.\n`;
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
                            } catch (err) {
                                alert('Failed to get response from Gemini API.');
                                setAiLoading(false);
                                return;
                            }
                            let exprJson: any = null;
                            const match = aiContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                            if (match) {
                                try {
                                    exprJson = JSON.parse(match[0]);
                                } catch {
                                    alert('AI response is not valid JSON');
                                    setAiLoading(false);
                                    return;
                                }
                            } else {
                                alert('Could not find JSON in AI response');
                                setAiLoading(false);
                                return;
                            }
                            const { filterExprFromJSON } = await import('../framework/filters');
                            const filterExpr = filterExprFromJSON(exprJson);
                            if (!filterExpr) {
                                alert('Could not parse AI response as FilterExpr');
                                setAiLoading(false);
                                return;
                            }
                            const newSchema = {
                                ...filterSchema,
                                filters: [
                                    ...filterSchema.filters,
                                    { label: 'AI Filter', expression: filterExpr, group: 'default' }
                                ]
                            };
                            setFilterSchema(newSchema);
                            const formState = [
                                ...filterState,
                                buildInitialFormState(filterExpr)
                            ];
                            setFilterState(formState);
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

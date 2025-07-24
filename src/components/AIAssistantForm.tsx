import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import SpeechInput from './SpeechInput';
import { FilterFormState, buildInitialFormState } from './FilterForm';
import { useState } from 'react';
import { filterExprFromJSON, FilterFieldSchema, getKeyNodes } from '../framework/filters';
import { View } from '../framework/view';

interface AIAssistantFormProps {
    filterSchema: FilterFieldSchema;
    filterState: FilterFormState[];
    setFilterSchema: (schema: FilterFieldSchema) => void;
    setFilterState: (state: FilterFormState[]) => void;
    selectedView: View;
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
                            const allKeys = Array.from(
                                new Set(
                                    selectedView.filterSchema.filters
                                        .flatMap(filter => getKeyNodes(filter.expression)
                                            .map(node => node.key)
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
                                '  | { type: "equals"; key: string; value: FilterControl }',
                                '  | { type: "notEquals"; key: string; value: FilterControl }',
                                '  | { type: "greaterThan"; key: string; value: FilterControl }',
                                '  | { type: "lessThan"; key: string; value: FilterControl }',
                                '  | { type: "greaterThanOrEqual"; key: string; value: FilterControl }',
                                '  | { type: "lessThanOrEqual"; key: string; value: FilterControl }',
                                '  | { type: "in"; key: string; value: FilterControl }',
                                '  | { type: "notIn"; key: string; value: FilterControl }',
                                '  | { type: "like"; key: string; value: FilterControl }',
                                '  | { type: "iLike"; key: string; value: FilterControl }',
                                '  | { type: "isNull"; key: string; value: FilterControl }',
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
                                    { label: 'AI Filter', expression: filterExpr, group: 'default', aiGenerated: true }
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

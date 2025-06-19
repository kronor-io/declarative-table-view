import type { FilterExpr } from '../framework/filters';
import { FilterControl, FilterFieldSchema } from '../framework/filters';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'primereact/button';
import { ReactNode } from 'react';

// Tree-like state for FilterForm
export type FilterFormState =
    | { type: 'leaf'; key: string; value: any; control: FilterControl; filterType: Extract<FilterExpr, { key: string }>['type']; transform?: { toQuery?: (input: any) => any; fromQuery?: (input: any) => any } }
    | { type: 'and' | 'or'; children: FilterFormState[]; filterType: 'and' | 'or' }
    | { type: 'not'; child: FilterFormState; filterType: 'not' };

// Helper to build initial state from FilterExpr
export function buildInitialFormState(expr: FilterExpr): FilterFormState {
    if (expr.type === 'and' || expr.type === 'or') {
        return {
            type: expr.type,
            children: expr.filters.map(buildInitialFormState),
            filterType: expr.type
        };
    } else if (expr.type === 'not') {
        return {
            type: 'not',
            child: buildInitialFormState(expr.filter),
            filterType: 'not'
        };
    } else {
        return {
            type: 'leaf',
            key: expr.key,
            value: 'initialValue' in expr.value && expr.value.initialValue !== undefined ? expr.value.initialValue : '',
            control: expr.value,
            filterType: expr.type,
            transform: expr.transform,
        };
    }
}

export type SavedFilter = {
    name: string;
    state: FilterFormState[];
};

interface FilterFormProps {
    filterSchema: FilterFieldSchema;
    formState: FilterFormState[];
    setFormState: (state: FilterFormState[]) => void;
    onSaveFilter: (state: FilterFormState[]) => void;
    visibleIndices?: number[]; // indices of filters to display
    onSubmit?: () => void;
}

function renderInput(control: FilterControl, value: any, setValue: (v: any) => void): ReactNode {
    switch (control.type) {
        case 'text':
            return (
                <InputText
                    className="w-full"
                    placeholder={control.placeholder}
                    value={value ?? ''}
                    onChange={e => setValue(e.target.value)}
                />
            )
        case 'number':
            return (
                <InputNumber
                    className="w-full"
                    placeholder={control.placeholder}
                    value={value ?? null}
                    onValueChange={e => setValue(e.value)}
                />
            )
        case 'date':
            return (
                <Calendar
                    className='w-full'
                    placeholder={control.placeholder}
                    value={value ?? null}
                    onChange={e => setValue(e.value)}
                    showIcon
                    showButtonBar
                    showTime
                    dateFormat='yy-mm-dd'
                />
            )
        case 'dropdown':
            return (
                <Dropdown
                    className='w-full'
                    value={value ?? null}
                    options={control.items}
                    onChange={e => setValue(e.value)}
                    optionLabel='label'
                    optionValue='value'
                    placeholder='Any'
                />
            );
        case 'multiselect':
            return (
                <MultiSelect
                    className='w-full'
                    value={value ?? []}
                    options={control.items}
                    onChange={e => setValue(e.value)}
                    optionLabel='label'
                    optionValue='value'
                    placeholder='Any'
                    display='chip'
                    filter={control.filterable}
                />
            );
        case 'customOperator': {
            const operator = value?.operator ?? control.operators[0]?.value;
            const isMulti = operator === '_in' || operator === '_nin';
            const val = value?.value ?? (isMulti ? [] : '');
            return (
                <div className="flex gap-2">
                    <Dropdown
                        className="min-w-[90px]"
                        value={operator}
                        options={control.operators}
                        onChange={e => setValue({ operator: e.value, value: (e.value === '_in' || e.value === '_nin') ? [] : '' })}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="Op"
                    />
                    <div className="flex-1">
                        {!isMulti && renderInput(control.valueControl, val, v => setValue({ operator, value: v }))}
                    </div>
                </div>
            );
        }
        case 'custom':
            return control.component ? (
                <control.component {...(control.props || {})} value={value} onChange={setValue} />
            ) : null;
    }
}

// Renders a FilterFormState tree using only the state (no schema needed)
function renderFilterFormState(
    state: FilterFormState,
    setState: (s: FilterFormState) => void
): ReactNode {
    if (state.type === 'and' || state.type === 'or') {
        return (
            <div className="flex flex-col gap-2 border-l-2 pl-2 ml-2">
                <div className="font-semibold text-xs mb-1 uppercase">{state.type}</div>
                {state.children.map((child, i) => (
                    <div key={i}>
                        {renderFilterFormState(
                            child,
                            newChild => {
                                const newChildren = [...state.children];
                                newChildren[i] = newChild;
                                setState({ ...state, children: newChildren });
                            }
                        )}
                    </div>
                ))}
            </div>
        );
    } else if (state.type === 'not') {
        return (
            <div className="flex flex-col gap-2 border-l-2 pl-2 ml-2">
                <div className="font-semibold text-xs mb-1">NOT</div>
                {renderFilterFormState(
                    state.child,
                    newChild => setState({ ...state, child: newChild })
                )}
            </div>
        );
    } else if (state.type === 'leaf') {
        // Apply transform.toQuery if present when setting value
        const handleSetValue = (v: any) => {
            let newValue = v;
            if (newValue !== null && state.transform && typeof state.transform.toQuery === 'function') {
                newValue = state.transform.toQuery(v);
            }
            setState({ ...state, value: newValue });
        };
        // Apply transform.fromQuery if present when displaying value
        let displayValue = state.value;
        if (displayValue && state.transform && typeof state.transform.fromQuery === 'function') {
            displayValue = state.transform.fromQuery(state.value).toString();
        }
        return (
            <div className="flex flex-col min-w-[220px] mb-2">
                <label className="text-sm font-medium mb-1">{state.control.label}</label>
                {renderInput(state.control, displayValue, handleSetValue)}
            </div>
        );
    }
    return null;
}

// Helper to check if a filter is empty
function isFilterEmpty(state: FilterFormState): boolean {
    if (state.type === 'leaf') {
        return state.value === '' || state.value === null || (Array.isArray(state.value) && state.value.length === 0);
    }
    if (state.type === 'not') {
        return isFilterEmpty(state.child);
    }
    return state.children.every(isFilterEmpty);
}

// Serialization helpers for FilterFormState
export function filterStateToJSON(state: FilterFormState[]): any {
    return state.map(node => serializeNode(node));
}

function serializeNode(node: FilterFormState): any {
    if (node.type === 'leaf') {
        let value = node.value;
        if (value instanceof Date) {
            value = value.toISOString();
        }
        return { ...node, value };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: serializeNode(node.child),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: node.children.map(serializeNode),
            filterType: node.filterType
        };
    }
}

// Helper: collect all keys that are date controls from the schema
function collectDateKeysFromSchema(schema: FilterFieldSchema): Set<string> {
    const dateKeys = new Set<string>();
    function traverse(expr: FilterExpr) {
        if (expr.type === 'and' || expr.type === 'or') {
            expr.filters.forEach(traverse);
        } else if ('key' in expr && 'value' in expr && expr.value.type === 'date') {
            dateKeys.add(expr.key);
        }
    }
    schema.forEach(field => traverse(field.expression));
    return dateKeys;
}

export function filterStateFromJSON(json: any, schema: FilterFieldSchema): FilterFormState[] {
    const dateKeys = collectDateKeysFromSchema(schema);
    return json.map((node: any) => deserializeNodeWithDates(node, dateKeys));
}

function deserializeNodeWithDates(node: any, dateKeys: Set<string>): FilterFormState {
    if (node.type === 'leaf') {
        let value = node.value;
        if (typeof value === 'string' && dateKeys.has(node.key)) {
            const date = new Date(value);
            value = isNaN(date.getTime()) ? null : date;
        }
        return { ...node, value };
    } else if (node.type === 'not') {
        return {
            type: 'not',
            child: deserializeNodeWithDates(node.child, dateKeys),
            filterType: node.filterType
        };
    } else {
        return {
            type: node.type,
            children: (node.children || []).map((child: any) => deserializeNodeWithDates(child, dateKeys)),
            filterType: node.filterType
        };
    }
}

function FilterForm({ filterSchema, formState, setFormState, onSaveFilter, visibleIndices, onSubmit }: FilterFormProps) {
    // Helper to reset a filter at index i
    function resetFilter(i: number) {
        const initial = buildInitialFormState(filterSchema[i].expression);
        const newFormState = [...formState];
        newFormState[i] = initial;
        setFormState(newFormState);
    }
    // Helper to reset all filters
    function resetAllFilters() {
        setFormState(filterSchema.map(f => buildInitialFormState(f.expression)));
    }
    // Use visibleIndices if provided, otherwise show all
    const indices = filterSchema.map((_, i) => i);
    const visibleSet = visibleIndices ? new Set(visibleIndices) : null;
    return (
        <form className="mb-4" onSubmit={e => { e.preventDefault(); onSubmit && onSubmit(); }}>
            <div className="flex flex-wrap gap-4 items-start">
                {indices.map(i => (
                    <div
                        key={i}
                        className="flex flex-col min-w-[220px] mb-2"
                        style={{ opacity: visibleSet && !visibleSet.has(i) ? 0.2 : 1 }}
                    >
                        <div className="flex items-center mb-1 max-h-[20px]">
                            <label className="text-sm font-bold">{filterSchema[i].label}</label>
                            <Button
                                type="button"
                                size='small'
                                icon='pi pi-filter-slash'
                                rounded
                                text
                                title="Reset filter"
                                onClick={() => resetFilter(i)}
                                visible={!isFilterEmpty(formState[i])}
                            />
                        </div>
                        {
                            renderFilterFormState(
                                formState[i],
                                newState => {
                                    const newFormState = [...formState];
                                    newFormState[i] = newState;
                                    setFormState(newFormState);
                                }
                            )
                        }
                    </div>
                ))}
            </div>
            <div className="flex gap-2 mb-3 justify-end">
                <Button type="submit" size='small' label="Apply filter" icon='pi pi-filter' />
                <Button type="button" size='small' outlined label="Reset All" icon='pi pi-filter-slash' onClick={resetAllFilters} className='p-button-secondary' />
                <Button type="button" size='small' outlined label="Save Filter" icon='pi pi-bookmark' onClick={() => onSaveFilter(formState)} className='p-button-secondary' />
            </div>
        </form>
    );
}

export default FilterForm;

import type { FilterExpr, FilterFieldGroup, FilterSchema, FilterId } from '../framework/filters';
import { FilterControl, FilterSchemasAndGroups } from '../framework/filters';
import { SavedFilter } from '../framework/saved-filters';
import { FilterFormState } from '../framework/filter-form-state';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'primereact/button';
import { SplitButton } from 'primereact/splitbutton';
import { ReactNode, useMemo } from 'react';
import { Panel } from 'primereact/panel';
import { createDefaultFilterState, FilterState, getFilterStateById, setFilterStateById, buildInitialFormState, FormStateInitMode } from '../framework/state';

// Re-export FilterFormState from the dedicated module
export type { FilterFormState } from '../framework/filter-form-state';

interface FilterFormProps {
    filterSchemasAndGroups: FilterSchemasAndGroups;
    filterState: FilterState
    setFilterState: (state: FilterState) => void;
    onSaveFilter: (state: FilterState) => void;
    onUpdateFilter: (filter: SavedFilter, state: FilterState) => void;
    onShareFilter: () => void;
    savedFilters: SavedFilter[];
    visibleFilterIds: FilterId[]; // indices of filters to display
    onSubmit: () => void;
}

function renderInput(control: FilterControl, value: any, setValue: (v: unknown) => void): ReactNode {
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
            const valueOrDefault = value?.value ?? '';
            return (
                <div className="flex gap-2">
                    <Dropdown
                        className="min-w-[90px]"
                        value={operator}
                        options={control.operators}
                        onChange={e => setValue({ operator: e.value, value: valueOrDefault })}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="operator"
                    />
                    <div className="flex-1">
                        {renderInput(control.valueControl, valueOrDefault, v => setValue({ operator, value: v }))}
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

// Recursively renders a FilterFormState tree from state
function renderFilterFormState(
    state: FilterFormState,
    setState: (state: FilterFormState) => void,
    renderFilterType: boolean,
    filterExpression: FilterExpr
): ReactNode {
    if (state.type === 'and' || state.type === 'or') {
        // Schema consistency check: filter expression must match state type
        if (filterExpression.type !== state.type) {
            throw new Error(`Schema consistency error: FilterFormState type "${state.type}" does not match FilterExpr type "${filterExpression.type}"`);
        }

        const childExpressions = filterExpression.filters;

        // Schema consistency check: must have same number of children
        if (childExpressions.length !== state.children.length) {
            throw new Error(`Schema consistency error: FilterFormState has ${state.children.length} children but FilterExpr has ${childExpressions.length} filters`);
        }

        return (
            <div className="flex flex-col gap-2 border-l-2 pl-2 ml-2">
                {
                    renderFilterType
                        ? (
                            <div className="font-semibold text-xs mb-1 uppercase">{state.type}</div>
                        )
                        : null
                }
                {
                    state.children.map((child, i) => (
                        <div key={i}>
                            {renderFilterFormState(
                                child,
                                newChild => {
                                    const newChildren = [...state.children];
                                    newChildren[i] = newChild;
                                    setState({ ...state, children: newChildren });
                                },
                                renderFilterType,
                                childExpressions[i]
                            )}
                        </div>
                    ))
                }
            </div>
        );
    } else if (state.type === 'not') {
        // Schema consistency check: filter expression must be 'not' type
        if (filterExpression.type !== 'not') {
            throw new Error(`Schema consistency error: FilterFormState type "not" does not match FilterExpr type "${filterExpression.type}"`);
        }

        const childExpression = filterExpression.filter;

        return (
            <div className="flex flex-col gap-2 border-l-2 pl-2 ml-2">
                {
                    renderFilterType
                        ? (
                            <div className="font-semibold text-xs mb-1 uppercase">{state.type}</div>
                        )
                        : null
                }
                {
                    renderFilterFormState(
                        state.child,
                        newChild => setState({ ...state, child: newChild }),
                        renderFilterType,
                        childExpression
                    )
                }
            </div>
        );
    } else if (state.type === 'leaf') {
        // Schema consistency check: filter expression must be a leaf type (not 'and', 'or', or 'not')
        if (filterExpression.type === 'and' || filterExpression.type === 'or' || filterExpression.type === 'not') {
            throw new Error(`Schema consistency error: FilterFormState is leaf type but FilterExpr is "${filterExpression.type}"`);
        }

        const handleSetValue = (value: unknown) => {
            const newState = { ...state, value };
            setState(newState);
        };

        // Use the raw state value for display - transforms are applied during query building
        const displayValue = state.value;

        return (
            <div className="flex flex-col min-w-[220px] mb-2">
                <label className="text-sm font-medium mb-1">{filterExpression.value.label}</label>
                {renderInput(filterExpression.value, displayValue, handleSetValue)}
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

function FilterForm({
    filterSchemasAndGroups,
    filterState,
    setFilterState,
    onSaveFilter,
    onUpdateFilter,
    onShareFilter,
    savedFilters,
    visibleFilterIds,
    onSubmit
}: FilterFormProps) {

    const filterSchemaById: Map<FilterId, FilterSchema> = useMemo(() => new Map(
        filterSchemasAndGroups.filters.map(filter => [filter.id, filter])
    ), [filterSchemasAndGroups]);

    const visibleSet = useMemo(() => new Set(visibleFilterIds), [visibleFilterIds]);

    // Helper to reset a filter by its ID
    function resetFilter(filterId: FilterId) {
        const filterSchema = filterSchemaById.get(filterId);
        if (!filterSchema) return;
        const initial = buildInitialFormState(filterSchema.expression, FormStateInitMode.Empty);
        setFilterState(setFilterStateById(filterState, filterId, initial));
    }

    // Helper to reset all filters
    function resetAllFilters() {
        setFilterState(
            createDefaultFilterState(filterSchemasAndGroups, FormStateInitMode.Empty)
        );
    }

    // Group filters by group name
    const defaultGroup: FilterFieldGroup | undefined = filterSchemasAndGroups.groups.find(group => group.name === 'default');
    const defaultFilters: FilterSchema[] = filterSchemasAndGroups.filters.filter(filter => filter.group === 'default' && visibleSet.has(filter.id));
    const otherGroups: FilterFieldGroup[] = filterSchemasAndGroups.groups.filter(group => group.name !== 'default');
    const filtersByGroup: Array<{ group: FilterFieldGroup; filters: FilterSchema[] }> =
        otherGroups
            .map(group => ({
                group,
                filters: filterSchemasAndGroups.filters.filter(filter => filter.group === group.name && visibleSet.has(filter.id))
            }))
            .filter(grouping => grouping.filters.length > 0);
    return (
        <form className="mb-4" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
            {/* Render default group filters above the dividers */}
            {defaultGroup && defaultFilters.length > 0 && (
                <div className="flex flex-wrap gap-4 items-start mb-4">
                    {
                        defaultFilters.map(filterSchema => (
                            <div key={filterSchema.id} className="flex flex-col min-w-[220px] mb-2">
                                <div className="flex items-center mb-1 max-h-[20px]">
                                    <label className="text-sm font-bold">{filterSchema.label}</label>
                                    <Button
                                        type="button"
                                        size='small'
                                        icon='pi pi-filter-slash'
                                        rounded
                                        text
                                        title="Reset filter"
                                        onClick={() => resetFilter(filterSchema.id)}
                                        visible={!isFilterEmpty(getFilterStateById(filterState, filterSchema.id))}
                                    />
                                </div>
                                {
                                    renderFilterFormState(
                                        getFilterStateById(filterState, filterSchema.id),
                                        newState => {
                                            setFilterState(setFilterStateById(filterState, filterSchema.id, newState));
                                        },
                                        filterSchema.aiGenerated,
                                        filterSchema.expression
                                    )
                                }
                            </div>
                        ))
                    }
                </div>
            )}
            {/* Render other groups with Panel and captions */}
            {
                filtersByGroup.map(({ group, filters }) => (
                    <Panel key={group.name} header={group.label} className="w-full mb-4">
                        <div className="flex flex-wrap gap-4 items-start">
                            {
                                filters.map((filterSchema) => (
                                    <div key={filterSchema.id} className="flex flex-col min-w-[220px] mb-2">
                                        <div className="flex items-center mb-1 max-h-[20px]">
                                            <label className="text-sm font-bold">{filterSchema.label}</label>
                                            <Button
                                                type="button"
                                                size='small'
                                                icon='pi pi-filter-slash'
                                                rounded
                                                text
                                                title="Reset filter"
                                                onClick={() => resetFilter(filterSchema.id)}
                                                visible={!isFilterEmpty(getFilterStateById(filterState, filterSchema.id))}
                                            />
                                        </div>
                                        {
                                            renderFilterFormState(
                                                getFilterStateById(filterState, filterSchema.id),
                                                newState => {
                                                    setFilterState(setFilterStateById(filterState, filterSchema.id, newState));
                                                },
                                                filterSchema.aiGenerated,
                                                filterSchema.expression
                                            )
                                        }
                                    </div>
                                ))
                            }
                        </div>
                    </Panel>
                ))
            }
            <div className="flex gap-2 mb-3 justify-end">
                <Button type="submit" size='small' label="Apply filter" icon='pi pi-filter' />
                <Button type="button" size='small' outlined label="Reset All" icon='pi pi-filter-slash' onClick={resetAllFilters} className='p-button-secondary' />
                <SplitButton
                    size='small'
                    outlined
                    label="Save Filter"
                    icon='pi pi-bookmark'
                    onClick={() => onSaveFilter(filterState)}
                    model={savedFilters.map(filter => ({
                        label: `Update “${filter.name}”`,
                        icon: 'pi pi-file-import',
                        command: () => onUpdateFilter(filter, filterState)
                    }))}
                    className='p-button-secondary'
                />
                <Button
                    type="button"
                    size='small'
                    outlined
                    icon="pi pi-share-alt"
                    label="Share Filter"
                    onClick={onShareFilter}
                    className="p-button-secondary"
                />
            </div>
        </form>
    );
}

export default FilterForm;

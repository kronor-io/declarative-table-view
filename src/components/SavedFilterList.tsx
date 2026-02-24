import { Button } from 'primereact/button';
import { confirmDialog } from 'primereact/confirmdialog';
import { Tag } from 'primereact/tag';
import { SavedFilter } from '../framework/saved-filters';
import { FilterState } from '../framework/state';
import { FilterControl, FilterExpr, FilterField, FilterSchemasAndGroups } from '../framework/filters';
import { FilterFormState, isFilterEmpty, traverseFilterSchemaAndState } from '../framework/filter-form-state';

interface SavedFilterListProps {
    savedFilters: SavedFilter[];
    onFilterDelete: (filterId: string) => void;
    onFilterLoad: (filterState: FilterState) => void;
    onFilterApply: () => void;
    onFilterShare: (filterState: FilterState) => void;
    visible: boolean;
    filterSchema: FilterSchemasAndGroups;
}

export default function SavedFilterList({ savedFilters, onFilterDelete, onFilterLoad, onFilterApply, onFilterShare, visible, filterSchema }: SavedFilterListProps) {
    if (!visible) {
        return null;
    }

    const handleDeleteFilter = (filter: SavedFilter) => {
        confirmDialog({
            message: `Are you sure you want to delete the filter "${filter.name}"? This action cannot be undone.`,
            header: 'Confirm Filter Deletion',
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'reject',
            acceptClassName: 'p-button-danger',
            accept: () => {
                onFilterDelete(filter.id);
            },
            reject: () => {
                // User cancelled - no action needed
            }
        });
    };

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    function isActiveFilter(filter: unknown) {
        if (!(typeof filter === 'object' && filter !== null && 'value' in filter)) {
            return false
        }
        if (Array.isArray(filter.value)) {
            return filter.value.length > 0;
        }
        if (typeof filter.value === 'object' && filter.value !== null && 'value' in filter.value) {
            return isActiveFilter(filter.value);
        }
        return filter.value !== ''
    }

    const schemaById = new Map(filterSchema.filters.map(f => [f.id, f]));

    function getFilterFieldDisplay(field: FilterField): string {
        if (typeof field === 'string') return field;
        if (field && typeof field === 'object') {
            if ('and' in field && Array.isArray(field.and)) return field.and.join(' & ');
            if ('or' in field && Array.isArray(field.or)) return field.or.join(' | ');
        }
        return String(field);
    }

    function getOperatorDisplay(exprType: FilterExpr['type']): string {
        switch (exprType) {
            case 'equals':
                return '=';
            case 'notEquals':
                return '!=';
            case 'greaterThan':
                return '>';
            case 'lessThan':
                return '<';
            case 'greaterThanOrEqual':
                return '>=';
            case 'lessThanOrEqual':
                return '<=';
            case 'in':
                return 'in';
            case 'notIn':
                return 'not in';
            case 'like':
                return 'like';
            case 'iLike':
                return 'ilike';
            case 'isNull':
                return 'is null';
            default:
                return exprType;
        }
    }

    function getFieldValueDisplay(value: any): string {
        if (value instanceof Date) {
            return new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }).format(value);
        }
        if (typeof value === 'string') {
            return value.length > 128 ? `${value.substring(0, 128)}...` : value;
        }
        if (Array.isArray(value)) {
            return value.map(v => getFieldValueDisplay(v)).join(', ');
        }
        if (typeof value === 'object' && value !== null) {
            if ('label' in value && typeof value.label === 'string') {
                return value.label;
            }
            if ('value' in value) {
                return getFieldValueDisplay(value.value);
            }
            return JSON.stringify(value);
        }
        return String(value);
    }

    function getControlValueDisplay(control: FilterControl, controlValue: any): string {
        // If the stored value already carries a label, prefer it.
        if (controlValue && typeof controlValue === 'object' && 'label' in controlValue && typeof controlValue.label === 'string') {
            return String(controlValue.label);
        }

        if (control.type === 'dropdown') {
            const item = control.items.find(item => item.value === controlValue);
            return item ? item.label : getFieldValueDisplay(controlValue);
        }

        if (control.type === 'multiselect') {
            if (!Array.isArray(controlValue)) {
                return getFieldValueDisplay(controlValue);
            }
            return controlValue
                .map(value => {
                    const item = control.items.find(item => item.value === value);
                    return item ? item.label : getFieldValueDisplay(value);
                })
                .join(', ');
        }

        return getFieldValueDisplay(controlValue);
    }

    function isLeafValueEmpty(schemaLeaf: Extract<FilterExpr, { field: FilterField; value: any }>, stateLeaf: FilterFormState & { type: 'leaf' }): boolean {
        const value = stateLeaf.value;
        if (schemaLeaf.value.type === 'customOperator') {
            const inner = value?.value;
            return inner === '' || inner === null || (Array.isArray(inner) && inner.length === 0);
        }
        return value === '' || value === null || (Array.isArray(value) && value.length === 0);
    }

    function formatLeaf(schemaLeaf: Extract<FilterExpr, { field: FilterField; value: any }>, stateLeaf: FilterFormState & { type: 'leaf' }): string {
        if (isLeafValueEmpty(schemaLeaf, stateLeaf)) {
            return '';
        }

        const field = `${getFilterFieldDisplay(schemaLeaf.field)} `

        if (schemaLeaf.value.type === 'customOperator') {
            const operatorValue = stateLeaf.value?.operator;
            const operatorLabel = schemaLeaf.value.operators.find(o => o.value === operatorValue)?.label ?? String(operatorValue ?? '');
            const valueStr = getControlValueDisplay(schemaLeaf.value.valueControl, stateLeaf.value?.value);
            return `${field}${operatorLabel} ${valueStr}`.trim();
        }

        const operator = getOperatorDisplay(schemaLeaf.type);
        const valueStr = getControlValueDisplay(schemaLeaf.value, stateLeaf.value);
        return `${field}${operator} ${valueStr}`.trim();
    }

    function renderExpressionWithState(expr: FilterExpr, node: FilterFormState): string {
        return traverseFilterSchemaAndState<string>(expr, node, {
            leaf: (schemaLeaf, stateLeaf) => {
                return formatLeaf(schemaLeaf, stateLeaf);
            },
            and: (_schemaAnd, _stateAnd, childResults) => {
                const parts = childResults.filter(Boolean);
                if (parts.length === 0) return '';
                return `AND(${parts.join(', ')})`;
            },
            or: (_schemaOr, _stateOr, childResults) => {
                const parts = childResults.filter(Boolean);
                if (parts.length === 0) return '';
                return `OR(${parts.join(', ')})`;
            },
            not: (_schemaNot, _stateNot, childResult) => {
                if (!childResult) return '';
                return `NOT(${childResult})`;
            }
        });
    }

    const renderFilterState = (state: FilterState) => {
        if (!state || state.size === 0) {
            return null;
        }

        const activeFilters = Array.from(state.entries()).filter(([filterId, filter]) => {
            const schemaEntry = schemaById.get(filterId);
            if (!schemaEntry) {
                return isActiveFilter(filter);
            }
            try {
                return !isFilterEmpty(filter, schemaEntry.expression);
            } catch {
                return isActiveFilter(filter);
            }
        });
        if (activeFilters.length === 0) {
            return null;
        }

        return (
            <div className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-1">
                {
                    activeFilters.map(([filterId, filter]) => {
                        const schemaEntry = schemaById.get(filterId);
                        const displayText =
                            schemaEntry
                                ? renderExpressionWithState(schemaEntry.expression, filter)
                                : `${filterId}: MISSING SCHEMA`;

                        return (
                            <Tag
                                key={filterId}
                                value={displayText}
                                className="tw:text-xs"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#6366f1',
                                    borderWidth: 1
                                }}
                            />
                        );
                    })
                }
            </div>
        );
    };

    return (
        <div className="tw:mb-4">
            <div className="tw:mb-3">
                <h3 className="tw:text-lg tw:font-medium tw:text-gray-900">Saved Filters</h3>
            </div>
            {savedFilters.length === 0 ? (
                <p className="tw:text-gray-500 tw:text-center tw:py-4">No saved filters for this view</p>
            ) : (
                <div className="tw:space-y-3">
                    {savedFilters.map((filter) => (
                        <div key={filter.id} className="tw:flex tw:items-center tw:justify-between tw:p-3 tw:border tw:border-gray-200 tw:rounded-lg">
                            <div className="tw:flex-1">
                                <div className="tw:flex tw:items-center tw:gap-2 tw:mb-1">
                                    <h4 className="tw:font-medium tw:text-gray-900">{filter.name}</h4>
                                    <span className="tw:text-xs tw:text-gray-500 tw:bg-gray-100 tw:px-2 tw:py-1 tw:rounded">
                                        Created: {formatDate(filter.createdAt)}
                                    </span>
                                </div>
                                {renderFilterState(filter.state)}
                            </div>
                            <div className="tw:flex tw:gap-2">
                                <Button
                                    size="small"
                                    outlined
                                    icon="pi pi-filter"
                                    label="Use"
                                    onClick={() => {
                                        onFilterLoad(filter.state);
                                        onFilterApply();
                                    }}
                                    className="p-button"
                                />
                                <Button
                                    size="small"
                                    outlined
                                    icon="pi pi-share-alt"
                                    label="Share"
                                    onClick={() => onFilterShare(filter.state)}
                                    className="p-button-secondary"
                                />
                                <Button
                                    size="small"
                                    outlined
                                    icon="pi pi-trash"
                                    label='Delete'
                                    onClick={() => handleDeleteFilter(filter)}
                                    className="p-button-danger"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

import { Button } from 'primereact/button';
import { confirmDialog } from 'primereact/confirmdialog';
import { Tag } from 'primereact/tag';
import { SavedFilter } from '../framework/saved-filters';
import { FilterState } from '../framework/state';
import { FilterSchemasAndGroups } from '../framework/filters';

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

    function getFieldDisplay(filterId: string): string {
        const schemaEntry = schemaById.get(filterId);
        if (!schemaEntry) return '';
        const expr: any = schemaEntry.expression;
        if (expr && 'field' in expr) {
            const fieldVal = expr.field;
            if (typeof fieldVal === 'string') return fieldVal;
            if (fieldVal && typeof fieldVal === 'object') {
                if ('and' in fieldVal && Array.isArray(fieldVal.and)) return fieldVal.and.join(' & ');
                if ('or' in fieldVal && Array.isArray(fieldVal.or)) return fieldVal.or.join(' | ');
            }
        }
        return '';
    }

    const renderFilterState = (state: FilterState) => {
        if (!state || state.size === 0) {
            return null;
        }

        const activeFilters = Array.from(state.entries())
            .filter(([, filter]) => isActiveFilter(filter));
        if (activeFilters.length === 0) {
            return null;
        }

        return (
            <div className="mt-2 flex flex-wrap gap-1">
                {
                    activeFilters.map(([filterId, filter], index) => {
                        // Handle different types of FilterFormState
                        let displayText = '';
                        if (filter.type === 'leaf') {
                            const valueStr = typeof filter.value === 'string' && filter.value.length > 128
                                ? `${filter.value.substring(0, 128)}...`
                                : String(filter.value);
                            const fieldName = getFieldDisplay(filterId);
                            displayText = fieldName ? `${fieldName}: ${valueStr}` : valueStr;
                        } else if (filter.type === 'and' || filter.type === 'or') {
                            displayText = `${filter.type.toUpperCase()} (${filter.children.length} filters)`;
                        } else if (filter.type === 'not') {
                            displayText = `NOT (1 filter)`;
                        }

                        return (
                            <Tag
                                key={index}
                                value={displayText}
                                className="text-xs"
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
        <div className="mb-4">
            <div className="mb-3">
                <h3 className="text-lg font-medium text-gray-900">Saved Filters</h3>
            </div>
            {savedFilters.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No saved filters for this view</p>
            ) : (
                <div className="space-y-3">
                    {savedFilters.map((filter) => (
                        <div key={filter.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium text-gray-900">{filter.name}</h4>
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                        Created: {formatDate(filter.createdAt)}
                                    </span>
                                </div>
                                {renderFilterState(filter.state)}
                            </div>
                            <div className="flex gap-2">
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

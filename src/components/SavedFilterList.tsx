import { Button } from 'primereact/button';
import { confirmDialog } from 'primereact/confirmdialog';
import { SavedFilter } from '../framework/saved-filters';
import { FilterState } from '../framework/state';
import { FilterGroups } from '../framework/filters';
import { getAllFilters } from '../framework/view';
import AppliedFilters from './AppliedFilterPills';
import { getAppliedFilterItems } from './appliedFilterPills.utils';

interface SavedFilterListProps {
    savedFilters: SavedFilter[];
    onFilterDelete: (filterId: string) => void;
    onFilterLoad: (filterState: FilterState) => void;
    onFilterApply: (filterState: FilterState) => void;
    onFilterShare: (filterState: FilterState) => void;
    visible: boolean;
    filterGroups: FilterGroups;
}

export default function SavedFilterList({ savedFilters, onFilterDelete, onFilterLoad, onFilterApply, onFilterShare, visible, filterGroups }: SavedFilterListProps) {
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

    const allFilters = getAllFilters(filterGroups);

    const renderFilterState = (state: FilterState) => {
        const items = getAppliedFilterItems(state, allFilters);
        if (items.length === 0) {
            return null;
        }

        return (
            <AppliedFilters items={items} className="tw:mt-2" />
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
                                        onFilterApply(filter.state);
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

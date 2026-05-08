import type { MouseEvent } from 'react';
import { Tag } from 'primereact/tag';
import type { FilterId } from '../framework/filters';
import type { AppliedFilterItem } from './appliedFilterPills.utils';

interface AppliedFiltersProps {
    items: AppliedFilterItem[];
    onRemove?: (filterId: FilterId) => void;
    className?: string;
}

export default function AppliedFilters({ items, onRemove, className }: AppliedFiltersProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className={`tw:flex tw:flex-wrap tw:items-center tw:gap-1 ${className ?? ''}`.trim()}>
            <span className="tw:mr-1 tw:inline-flex tw:items-center tw:text-xs tw:text-gray-500">Applied Filters:</span>
            {items.map(item => (
                <Tag
                    key={item.filterId}
                    className="tw:text-xs"
                    style={{
                        backgroundColor: 'transparent',
                        color: '#6366f1',
                        borderWidth: 1
                    }}
                >
                    <div className="tw:flex tw:items-center tw:gap-1 tw:min-w-0">
                        <span className="tw:min-w-0 tw:truncate">{item.displayText}</span>
                        {
                            onRemove
                                ? (
                                    <button
                                        type="button"
                                        aria-label={`Reset filter ${item.filterId}`}
                                        title="Remove this filter"
                                        className="tw:-mr-0.5 tw:inline-flex tw:h-[1em] tw:w-[1em] tw:flex-none tw:cursor-pointer tw:items-center tw:justify-center tw:border-0 tw:bg-transparent tw:p-0 tw:leading-none tw:text-current"
                                        onClick={(event: MouseEvent<HTMLElement>) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            onRemove(item.filterId);
                                        }}
                                    >
                                        <svg
                                            aria-hidden="true"
                                            viewBox="0 0 16 16"
                                            className="tw:h-[0.85em] tw:w-[0.85em]"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                        >
                                            <path d="M4 4L12 12" />
                                            <path d="M12 4L4 12" />
                                        </svg>
                                    </button>
                                )
                                : null
                        }
                    </div>
                </Tag>
            ))}
        </div>
    );
}

// React import retained only if JSX requires it per tooling; can remove in React 17+ with new JSX transform.
// Removed unused React import (new JSX transform handles it)
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';

interface TablePaginationProps {
    onPageChange: () => void;
    onPrevPage: () => void;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    currentPage: number; // 0-based
    rowsPerPage: number;
    actualRows: number; // number of rows in the current page
    onRowsPerPageChange?: (value: number) => void; // invoked when user selects a different page size
    rowsPerPageOptions: number[]; // selectable page size options (must be provided by parent)
}
/**
 * Pagination footer including previous/next buttons and a rows-per-page selector.
 */
function TablePagination({ onPageChange, onPrevPage, hasNextPage, hasPrevPage, currentPage, rowsPerPage, actualRows, onRowsPerPageChange, rowsPerPageOptions }: TablePaginationProps) {
    const start = currentPage * rowsPerPage + 1;
    const end = start + actualRows - 1;
    const singleOption = rowsPerPageOptions.length === 1 ? rowsPerPageOptions[0] : null;
    const options = rowsPerPageOptions.map((value: number) => ({ label: value.toString(), value }));
    return (
        <div className="tw:flex tw:items-center tw:mt-4 tw:gap-4 tw:flex-wrap">
            <div className="tw:flex tw:flex-1 tw:items-center tw:gap-2 tw:text-sm" data-testid="rows-per-page-control">
                <span className="tw:text-gray-600">Rows per page:</span>
                {
                    singleOption !== null
                        ? (
                            <span data-testid="rows-per-page-static" className="tw:text-gray-600">{singleOption}</span>
                        )
                        : (
                            <Dropdown
                                value={rowsPerPage}
                                options={options}
                                onChange={(e) => onRowsPerPageChange?.(Number(e.value))}
                                data-testid="rows-per-page-dropdown"
                                aria-label="Rows per page"
                            />
                        )
                }
            </div>
            <div className="tw:flex tw:items-center">
                <Button
                    rounded
                    icon="pi pi-angle-left"
                    onClick={onPrevPage}
                    disabled={!hasPrevPage}
                    className="p-button-sm"
                    data-testid="pagination-prev"
                />
                <span className="tw:text-s tw:text-gray-600 tw:mx-3" data-testid="pagination-page">{start}-{end}</span>
                <Button
                    rounded
                    icon="pi pi-angle-right"
                    onClick={onPageChange}
                    disabled={!hasNextPage}
                    className="p-button-sm"
                    data-testid="pagination-next"
                />
            </div>
            <div className='tw:flex-1'></div>
        </div>
    );
}

export default TablePagination;

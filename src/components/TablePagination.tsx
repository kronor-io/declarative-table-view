// React import retained only if JSX requires it per tooling; can remove in React 17+ with new JSX transform.
// Removed unused React import (new JSX transform handles it)
import { Button } from 'primereact/button';

interface TablePaginationProps {
    onPageChange: () => void;
    onPrevPage: () => void;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    currentPage: number; // 0-based
    rowsPerPage: number;
    actualRows: number; // number of rows in the current page
}

function TablePagination({ onPageChange, onPrevPage, hasNextPage, hasPrevPage, currentPage, rowsPerPage, actualRows }: TablePaginationProps) {
    const start = currentPage * rowsPerPage + 1;
    const end = start + actualRows - 1;
    return (
        <div className="tw:flex tw:justify-center tw:items-center tw:mt-4 tw:gap-2">
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
    );
}

export default TablePagination;

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
    onRowsPerPageChange: (value: number) => void;
}

const ROWS_OPTIONS = [
    { label: '20', value: 20 },
    { label: '50', value: 50 },
    { label: '100', value: 100 },
    { label: '500', value: 500 },
];

function TablePagination({
    onPageChange,
    onPrevPage,
    hasNextPage,
    hasPrevPage,
    currentPage,
    rowsPerPage,
    actualRows,
    onRowsPerPageChange,
}: TablePaginationProps) {
    const start = currentPage * rowsPerPage + 1;
    const end = start + actualRows - 1;

    return (
        <div className="tw:flex tw:justify-center tw:items-center tw:mt-4 tw:gap-4">
            <Dropdown
                value={rowsPerPage}
                options={ROWS_OPTIONS}
                onChange={(e) => onRowsPerPageChange(e.value)}
                className="p-dropdown-sm"
                data-testid="rows-per-page"
            />
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

import React from 'react';
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

const TablePagination: React.FC<TablePaginationProps> = ({ onPageChange, onPrevPage, hasNextPage, hasPrevPage, currentPage, rowsPerPage, actualRows }) => {
    const start = currentPage * rowsPerPage + 1;
    const end = start + actualRows - 1;
    return (
        <div className="flex justify-center items-center mt-4 gap-2">
            <Button
                rounded
                icon="pi pi-angle-left"
                onClick={onPrevPage}
                disabled={!hasPrevPage}
                className="p-button-sm"
                data-testid="pagination-prev"
            />
            <span className="text-s text-gray-600 mx-3" data-testid="pagination-page">{start}-{end}</span>
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
};

export default TablePagination;

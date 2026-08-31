import * as React from 'react';

type LoadingOverlayProps = {
    message?: string;
    /** Extra classes for the outer overlay container */
    className?: string;
    /** Optional custom content inside the overlay; if provided, `message` is ignored */
    children?: React.ReactNode;
};

export default function LoadingOverlay({ message = 'Loading…', className = '', children }: LoadingOverlayProps) {

    return (
        <div
            className={`tw:absolute tw:inset-0 tw:bg-black/30 tw:flex tw:items-center tw:justify-center tw:z-10 ${className}`}
            role="status"
            aria-live="polite"
        >
            <div className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:bg-white tw:p-4 tw:rounded tw:shadow">
                <i className="pi pi-spinner pi-spin tw:text-2xl" aria-label="Loading" />
                {children ?? <span className="tw:text-sm">{message}</span>}
            </div>
        </div>
    );
}

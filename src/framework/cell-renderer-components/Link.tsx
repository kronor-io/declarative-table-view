import * as React from 'react';

export interface LinkProps {
    text: string;
    href: string;
    className?: string;
}

/**
 * A reusable Link component for use throughout the application.
 * Provides consistent styling and behavior for links.
 */
export const Link: React.FC<LinkProps> = ({
    text,
    href,
    className = "tw:text-blue-500 tw:underline hover:tw:text-blue-700 tw:cursor-pointer",
}) => {
    return (
        <a
            href={href}
            className={className}
        >
            {text}
        </a>
    );
};

export default Link;
